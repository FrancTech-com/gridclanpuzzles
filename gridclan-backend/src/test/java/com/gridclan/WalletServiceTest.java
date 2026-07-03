package com.gridclan;

import com.gridclan.entity.PlayerWallet;
import com.gridclan.entity.WalletTransaction;
import com.gridclan.repository.PlayerWalletRepository;
import com.gridclan.repository.WalletTransactionRepository;
import com.gridclan.service.WalletService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Wallet invariants: holds can't overdraw, every movement hits the ledger. */
@ExtendWith(MockitoExtension.class)
class WalletServiceTest {

    @Mock PlayerWalletRepository      walletRepo;
    @Mock WalletTransactionRepository txRepo;

    private WalletService svc() { return new WalletService(walletRepo, txRepo); }

    private PlayerWallet wallet(UUID user, String bal) {
        return PlayerWallet.builder()
            .id(UUID.randomUUID()).userId(user).currency("UGX")
            .balance(new BigDecimal(bal)).build();
    }

    @Test
    void hold_debitsAndWritesLedger() {
        UUID user = UUID.randomUUID();
        PlayerWallet w = wallet(user, "20000");
        when(walletRepo.lockByUserIdAndCurrency(user, "UGX")).thenReturn(Optional.of(w));

        svc().hold(user, "UGX", new BigDecimal("15000"), UUID.randomUUID());

        assertThat(w.getBalance()).isEqualByComparingTo("5000");
        ArgumentCaptor<WalletTransaction> cap = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(txRepo).save(cap.capture());
        assertThat(cap.getValue().getType()).isEqualTo("WITHDRAW_HOLD");
        assertThat(cap.getValue().getAmountDelta()).isEqualByComparingTo("-15000");
    }

    @Test
    void hold_insufficientBalance_rejectedUntouched() {
        UUID user = UUID.randomUUID();
        PlayerWallet w = wallet(user, "1000");
        when(walletRepo.lockByUserIdAndCurrency(user, "UGX")).thenReturn(Optional.of(w));

        assertThatThrownBy(() -> svc().hold(user, "UGX", new BigDecimal("5000"), UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Not enough balance");
        assertThat(w.getBalance()).isEqualByComparingTo("1000");
        verify(txRepo, never()).save(any());
    }

    @Test
    void hold_noWalletInThatCurrency_rejected() {
        UUID user = UUID.randomUUID();
        when(walletRepo.lockByUserIdAndCurrency(user, "UGX")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc().hold(user, "UGX", new BigDecimal("5000"), UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void creditPrize_createsWalletAndTracksLifetime() {
        UUID user = UUID.randomUUID();
        when(walletRepo.lockByUserIdAndCurrency(user, "UGX")).thenReturn(Optional.empty());
        when(walletRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        svc().creditPrize(user, "UGX", new BigDecimal("8000"), UUID.randomUUID(), "Tournament prize");

        ArgumentCaptor<PlayerWallet> cap = ArgumentCaptor.forClass(PlayerWallet.class);
        verify(walletRepo, atLeastOnce()).save(cap.capture());
        PlayerWallet w = cap.getValue();
        assertThat(w.getBalance()).isEqualByComparingTo("8000");
        assertThat(w.getLifetimeEarned()).isEqualByComparingTo("8000");
    }

    @Test
    void creditPrize_nonPositiveAmount_isANoOp() {
        svc().creditPrize(UUID.randomUUID(), "UGX", BigDecimal.ZERO, null, null);
        svc().creditPrize(UUID.randomUUID(), "UGX", new BigDecimal("-5"), null, null);
        verifyNoInteractions(walletRepo, txRepo);
    }

    @Test
    void refundHold_creditsBackWithLedgerRow() {
        UUID user = UUID.randomUUID();
        PlayerWallet w = wallet(user, "0");
        when(walletRepo.lockByUserIdAndCurrency(user, "UGX")).thenReturn(Optional.of(w));

        svc().refundHold(user, "UGX", new BigDecimal("15000"), UUID.randomUUID(), "payout failed");

        assertThat(w.getBalance()).isEqualByComparingTo("15000");
        ArgumentCaptor<WalletTransaction> cap = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(txRepo).save(cap.capture());
        assertThat(cap.getValue().getType()).isEqualTo("WITHDRAW_REFUND");
    }
}
