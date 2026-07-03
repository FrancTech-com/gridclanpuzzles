package com.gridclan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.config.GemStoreProperties;
import com.gridclan.config.RelworxProperties;
import com.gridclan.entity.GemPurchase;
import com.gridclan.repository.GemPurchaseRepository;
import com.gridclan.service.GemPurchaseService;
import com.gridclan.service.GemService;
import com.gridclan.service.PhoneCurrencyResolver;
import com.gridclan.service.RelworxClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for gem buying: phone→currency mapping, the per-currency quote, and
 * the critical webhook invariant — gems credited exactly once, never twice.
 */
@ExtendWith(MockitoExtension.class)
class GemPurchaseTest {

    @Mock RelworxClient        client;
    @Mock GemPurchaseRepository purchaseRepo;
    @Mock GemService           gemService;
    @Mock com.gridclan.service.AdRewardService adRewardService;

    private final PhoneCurrencyResolver resolver = new PhoneCurrencyResolver();

    private GemStoreProperties store() {
        GemStoreProperties s = new GemStoreProperties();
        GemStoreProperties.Pack pack = new GemStoreProperties.Pack();
        pack.setId("popular");
        pack.setGems(150);
        pack.setAdFreeMonths(4);
        pack.setPrices(Map.of("UGX", new BigDecimal("7000")));
        s.setPacks(List.of(pack));
        return s;
    }

    private RelworxProperties configured() {
        RelworxProperties p = new RelworxProperties();
        p.setApiKey("k"); p.setAccountNo("acc"); p.setWebhookSecret("s");
        return p;
    }

    private GemPurchaseService svc() {
        return new GemPurchaseService(store(), configured(), client, resolver,
            purchaseRepo, gemService, adRewardService, new ObjectMapper());
    }

    // ── Phone → currency ───────────────────────────────────────────────────────

    @Test
    void resolver_mapsCountryCodes() {
        assertThat(resolver.currencyFor("+256700000000")).isEqualTo("UGX");
        assertThat(resolver.currencyFor("254712345678")).isEqualTo("KES");
        assertThat(resolver.currencyFor("+255754000000")).isEqualTo("TZS");
        assertThat(resolver.currencyFor("+10000000000")).isNull();   // unsupported country
        assertThat(resolver.normalise("+256 700-000")).isEqualTo("+256700000");
    }

    // ── Quote ──────────────────────────────────────────────────────────────────

    @Test
    void quote_pricesPacksInPhoneCurrency() {
        when(client.validate(any()))
            .thenReturn(new RelworxClient.ValidationResult(true, "Test User", "ok"));
        Map<String, Object> q = svc().quote("+256700000000");
        assertThat(q.get("currency")).isEqualTo("UGX");
        assertThat(q.get("configured")).isEqualTo(true);
        assertThat(q.get("customerName")).isEqualTo("Test User");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> packs = (List<Map<String, Object>>) q.get("packs");
        assertThat(packs).hasSize(1);
        assertThat(packs.get(0).get("gems")).isEqualTo(150L);
        assertThat(packs.get(0).get("price")).isEqualTo(new BigDecimal("7000"));
    }

    @Test
    void quote_unsupportedCountry_hasNoPacks() {
        Map<String, Object> q = svc().quote("+10000000000");
        assertThat(q.get("currency")).isNull();
        assertThat((List<?>) q.get("packs")).isEmpty();
    }

    // ── Status poll fallback (confirms without the webhook) ─────────────────────

    @Test
    void status_pollFallback_creditsWhenRelworxConfirms() {
        UUID user = UUID.randomUUID();
        GemPurchase p = GemPurchase.builder()
            .id(UUID.randomUUID()).userId(user).packId("popular").gems(150)
            .currency("UGX").amount(new BigDecimal("7000")).msisdn("+256700000000")
            .reference("GEMS-x").providerReference("int-ref").status("PENDING").build();

        when(purchaseRepo.lockByReference("GEMS-x")).thenReturn(Optional.of(p));
        when(client.checkStatus("int-ref")).thenReturn(new RelworxClient.StatusResult(true, "success", null));

        Map<String, Object> out = svc().status(user, "GEMS-x");

        assertThat(out.get("status")).isEqualTo("SUCCESSFUL");
        assertThat(p.getStatus()).isEqualTo("SUCCESSFUL");
        verify(gemService, times(1)).creditGems(eq(user), eq(150L), eq("PURCHASE"), eq(p.getId()));
    }

    // ── Card (Visa/Mastercard) ──────────────────────────────────────────────────

    @Test
    void supportedCurrencies_listsCatalogCurrencies() {
        @SuppressWarnings("unchecked")
        List<String> curs = (List<String>) svc().supportedCurrencies().get("currencies");
        assertThat(curs).containsExactly("UGX");
    }

    @Test
    void initiateCard_opensSessionAndReturnsPaymentUrl() {
        UUID user = UUID.randomUUID();
        when(client.requestVisaSession(any(), eq("UGX"), any(), any()))
            .thenReturn(new RelworxClient.VisaSessionResult(true, "https://pay.relworx/abc", "ok"));

        Map<String, Object> out = svc().initiateCard(user, "popular", "UGX");

        assertThat(out.get("paymentUrl")).isEqualTo("https://pay.relworx/abc");
        assertThat(out.get("status")).isEqualTo("PENDING");
        ArgumentCaptor<GemPurchase> cap = ArgumentCaptor.forClass(GemPurchase.class);
        verify(purchaseRepo, atLeastOnce()).save(cap.capture());
        GemPurchase saved = cap.getValue();
        assertThat(saved.getMethod()).isEqualTo("CARD");
        assertThat(saved.getMsisdn()).isNull();
    }

    // ── Webhook idempotency (the money-critical path) ───────────────────────────

    @Test
    void webhook_creditsExactlyOnce() {
        UUID user = UUID.randomUUID();
        GemPurchase purchase = GemPurchase.builder()
            .id(UUID.randomUUID()).userId(user).packId("popular").gems(150)
            .currency("UGX").amount(new BigDecimal("7000")).msisdn("+256700000000")
            .reference("GEMS-abc").status("PENDING").build();

        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(true);
        when(purchaseRepo.lockByReference("GEMS-abc")).thenReturn(Optional.of(purchase));

        // Relworx echoes our reference back as customer_reference.
        String body = "{\"customer_reference\":\"GEMS-abc\",\"status\":\"success\"}";
        Map<String, String> headers = Map.of("Relworx-Signature", "sig", "Relworx-Timestamp", "t");
        GemPurchaseService svc = svc();

        svc.handleWebhook(body, headers);                     // first delivery → credit
        assertThat(purchase.getStatus()).isEqualTo("SUCCESSFUL");
        verify(gemService, times(1)).creditGems(eq(user), eq(150L), eq("PURCHASE"), eq(purchase.getId()));
        // The paid pack also buys its ad-free months, exactly once.
        verify(adRewardService, times(1)).extendAdFree(user, 4);

        svc.handleWebhook(body, headers);                     // duplicate delivery → no-op
        verify(gemService, times(1)).creditGems(any(), anyLong(), anyString(), any());
        verify(adRewardService, times(1)).extendAdFree(any(), anyInt());
    }

    @Test
    void webhook_failure_recordsReasonAndDoesNotCredit() {
        GemPurchase purchase = GemPurchase.builder()
            .id(UUID.randomUUID()).userId(UUID.randomUUID()).packId("popular").gems(150)
            .currency("UGX").amount(new BigDecimal("7000")).msisdn("+256700000000")
            .reference("GEMS-f").status("PENDING").build();

        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(true);
        when(purchaseRepo.lockByReference("GEMS-f")).thenReturn(Optional.of(purchase));

        String body = "{\"customer_reference\":\"GEMS-f\",\"status\":\"failed\","
            + "\"message\":\"Insufficient balance\"}";
        svc().handleWebhook(body, Map.of("Relworx-Signature", "s", "Relworx-Timestamp", "t"));

        assertThat(purchase.getStatus()).isEqualTo("FAILED");
        assertThat(purchase.getFailureReason()).isEqualTo("Insufficient balance");
        verify(gemService, never()).creditGems(any(), anyLong(), anyString(), any());
    }

    @Test
    void webhook_badSignature_rejected() {
        when(client.verifyWebhook(any(), any(), anyMap(), any())).thenReturn(false);
        assertThatThrownBy(() -> svc().handleWebhook("{}", Map.of()))
            .hasMessageContaining("signature");
        verifyNoInteractions(gemService);
    }
}
