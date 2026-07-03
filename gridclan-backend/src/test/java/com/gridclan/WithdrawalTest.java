package com.gridclan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.config.RelworxProperties;
import com.gridclan.config.WalletProperties;
import com.gridclan.entity.Withdrawal;
import com.gridclan.repository.WithdrawalRepository;
import com.gridclan.service.PhoneCurrencyResolver;
import com.gridclan.service.RelworxClient;
import com.gridclan.service.WalletService;
import com.gridclan.service.WithdrawalService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for cash withdrawals — the money-OUT path. The critical invariants:
 *   • funds are held BEFORE Relworx is asked to send;
 *   • a definitive refusal aborts (no hold survives);
 *   • an AMBIGUOUS send keeps the hold (never auto-refund — money may have moved);
 *   • the webhook settles exactly once: refund once on failure, never on success,
 *     and duplicates are no-ops.
 */
@ExtendWith(MockitoExtension.class)
class WithdrawalTest {

    @Mock RelworxClient        client;
    @Mock WithdrawalRepository withdrawalRepo;
    @Mock WalletService        walletService;

    private final PhoneCurrencyResolver resolver = new PhoneCurrencyResolver();

    private RelworxProperties configured() {
        RelworxProperties p = new RelworxProperties();
        p.setApiKey("k"); p.setAccountNo("acc"); p.setWebhookSecret("s");
        return p;
    }

    private WalletProperties limits() {
        WalletProperties p = new WalletProperties();
        p.setMinWithdraw(Map.of("UGX", new BigDecimal("5000")));
        p.setMaxWithdraw(Map.of("UGX", new BigDecimal("5000000")));
        return p;
    }

    private WithdrawalService svc() {
        return new WithdrawalService(configured(), limits(), client, resolver,
            withdrawalRepo, walletService, new ObjectMapper());
    }

    private Withdrawal pending(String ref) {
        return Withdrawal.builder()
            .id(UUID.randomUUID()).userId(UUID.randomUUID()).msisdn("+256700000000")
            .currency("UGX").amount(new BigDecimal("10000"))
            .reference(ref).providerReference("int-ref").status("PENDING")
            .build();
    }

    // ── Initiate ────────────────────────────────────────────────────────────────

    @Test
    void initiate_holdsFundsBeforeSending() {
        UUID user = UUID.randomUUID();
        when(client.sendPayment(any(), eq("+256700000000"), eq("UGX"), any(), any()))
            .thenReturn(new RelworxClient.SendResult(
                RelworxClient.SendOutcome.ACCEPTED, "int-ref", "ok"));

        Map<String, Object> out = svc().initiate(user, "+256 700 000 000", new BigDecimal("10000"));

        assertThat(out.get("status")).isEqualTo("PENDING");
        assertThat(out.get("currency")).isEqualTo("UGX");
        // The hold happens before the send, against the withdrawal's id.
        var inOrder = inOrder(walletService, client);
        inOrder.verify(walletService).hold(eq(user), eq("UGX"), eq(new BigDecimal("10000")), any());
        inOrder.verify(client).sendPayment(any(), any(), any(), any(), any());
        // Relworx's reference is stored for reconciliation.
        ArgumentCaptor<Withdrawal> cap = ArgumentCaptor.forClass(Withdrawal.class);
        verify(withdrawalRepo, atLeastOnce()).save(cap.capture());
        assertThat(cap.getValue().getProviderReference()).isEqualTo("int-ref");
    }

    @Test
    void initiate_rejectedByRelworx_throwsSoTheHoldRollsBack() {
        when(client.sendPayment(any(), any(), any(), any(), any()))
            .thenReturn(new RelworxClient.SendResult(
                RelworxClient.SendOutcome.REJECTED, null, "Invalid recipient"));

        assertThatThrownBy(() ->
            svc().initiate(UUID.randomUUID(), "+256700000000", new BigDecimal("10000")))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Invalid recipient");
        // The throw makes the surrounding @Transactional roll the hold back;
        // no refund call must be made (that would double-credit after rollback).
        verify(walletService, never()).refundHold(any(), any(), any(), any(), any());
    }

    @Test
    void initiate_ambiguousOutcome_keepsHoldAndStaysPending() {
        UUID user = UUID.randomUUID();
        when(client.sendPayment(any(), any(), any(), any(), any()))
            .thenReturn(new RelworxClient.SendResult(
                RelworxClient.SendOutcome.UNKNOWN, null, "timeout"));

        Map<String, Object> out = svc().initiate(user, "+256700000000", new BigDecimal("10000"));

        // Money may have moved: keep the hold, stay PENDING, never refund here.
        assertThat(out.get("status")).isEqualTo("PENDING");
        verify(walletService, times(1)).hold(eq(user), eq("UGX"), any(), any());
        verify(walletService, never()).refundHold(any(), any(), any(), any(), any());
    }

    @Test
    void initiate_belowMinimum_rejected() {
        assertThatThrownBy(() ->
            svc().initiate(UUID.randomUUID(), "+256700000000", new BigDecimal("1000")))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("minimum");
        verifyNoInteractions(client);
        verify(walletService, never()).hold(any(), any(), any(), any());
    }

    @Test
    void initiate_aboveMaximum_rejected() {
        assertThatThrownBy(() ->
            svc().initiate(UUID.randomUUID(), "+256700000000", new BigDecimal("9000000")))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("maximum");
        verifyNoInteractions(client);
    }

    @Test
    void initiate_unsupportedCountry_rejected() {
        assertThatThrownBy(() ->
            svc().initiate(UUID.randomUUID(), "+10000000000", new BigDecimal("10000")))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("country");
        verifyNoInteractions(client);
    }

    // ── Webhook settling (the money-critical path) ──────────────────────────────

    @Test
    void webhook_success_finalisesWithoutRefund() {
        Withdrawal w = pending("WDRW-ok");
        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(true);
        when(withdrawalRepo.lockByReference("WDRW-ok")).thenReturn(Optional.of(w));

        String body = "{\"customer_reference\":\"WDRW-ok\",\"status\":\"success\"}";
        svc().handleWebhook(body, Map.of("Relworx-Signature", "sig", "Relworx-Timestamp", "t"));

        assertThat(w.getStatus()).isEqualTo("SUCCESSFUL");
        verify(walletService, times(1)).markWithdrawn(w.getUserId(), "UGX", w.getAmount());
        verify(walletService, never()).refundHold(any(), any(), any(), any(), any());
    }

    @Test
    void webhook_failure_refundsExactlyOnce() {
        Withdrawal w = pending("WDRW-f");
        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(true);
        when(withdrawalRepo.lockByReference("WDRW-f")).thenReturn(Optional.of(w));

        String body = "{\"customer_reference\":\"WDRW-f\",\"status\":\"failed\","
            + "\"message\":\"Recipient not registered\"}";
        Map<String, String> headers = Map.of("Relworx-Signature", "s", "Relworx-Timestamp", "t");
        WithdrawalService svc = svc();

        svc.handleWebhook(body, headers);                 // first delivery → refund
        assertThat(w.getStatus()).isEqualTo("FAILED");
        assertThat(w.getFailureReason()).isEqualTo("Recipient not registered");
        verify(walletService, times(1)).refundHold(eq(w.getUserId()), eq("UGX"),
            eq(w.getAmount()), eq(w.getId()), any());

        svc.handleWebhook(body, headers);                 // duplicate delivery → no-op
        verify(walletService, times(1)).refundHold(any(), any(), any(), any(), any());
    }

    @Test
    void webhook_cannotFlipASettledWithdrawal() {
        Withdrawal w = pending("WDRW-done");
        w.setStatus("SUCCESSFUL");
        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(true);
        when(withdrawalRepo.lockByReference("WDRW-done")).thenReturn(Optional.of(w));

        // A late "failed" callback must not refund money that was delivered.
        String body = "{\"customer_reference\":\"WDRW-done\",\"status\":\"failed\"}";
        svc().handleWebhook(body, Map.of("Relworx-Signature", "s", "Relworx-Timestamp", "t"));

        assertThat(w.getStatus()).isEqualTo("SUCCESSFUL");
        verify(walletService, never()).refundHold(any(), any(), any(), any(), any());
    }

    @Test
    void webhook_badSignature_rejected() {
        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(false);
        assertThatThrownBy(() -> svc().handleWebhook("{}", Map.of()))
            .hasMessageContaining("signature");
        verifyNoInteractions(walletService);
    }

    // ── Status poll fallback (settles without the webhook) ──────────────────────

    @Test
    void status_pollFallback_settlesFailureWithRefund() {
        Withdrawal w = pending("WDRW-p");
        when(withdrawalRepo.lockByReference("WDRW-p")).thenReturn(Optional.of(w));
        when(client.checkStatus("int-ref"))
            .thenReturn(new RelworxClient.StatusResult(true, "failed", "No such account"));

        Map<String, Object> out = svc().status(w.getUserId(), "WDRW-p");

        assertThat(out.get("status")).isEqualTo("FAILED");
        verify(walletService, times(1)).refundHold(eq(w.getUserId()), eq("UGX"),
            eq(w.getAmount()), eq(w.getId()), any());
    }

    @Test
    void status_otherUsersWithdrawal_notFound() {
        Withdrawal w = pending("WDRW-x");
        when(withdrawalRepo.lockByReference("WDRW-x")).thenReturn(Optional.of(w));
        assertThatThrownBy(() -> svc().status(UUID.randomUUID(), "WDRW-x"))
            .isInstanceOf(ResponseStatusException.class);
    }
}
