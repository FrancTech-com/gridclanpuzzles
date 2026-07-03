package com.gridclan.service;

import com.gridclan.entity.PlayerWallet;
import com.gridclan.entity.WalletTransaction;
import com.gridclan.repository.PlayerWalletRepository;
import com.gridclan.repository.WalletTransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * The real-cash prize wallet (per user, per currency). Unlike gems, this money
 * IS withdrawable — so every mutation is row-locked (SELECT FOR UPDATE) and
 * written to the {@code wallet_transactions} audit ledger.
 *
 * Movement types:
 *   PRIZE            — earnings in (the upcoming earning system credits here)
 *   WITHDRAW_HOLD    — debit when a withdrawal is initiated
 *   WITHDRAW_REFUND  — credit back when a payout definitively fails
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WalletService {

    private final PlayerWalletRepository      walletRepo;
    private final WalletTransactionRepository txRepo;

    // ── Reads ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PlayerWallet> balances(UUID userId) {
        return walletRepo.findByUserId(userId);
    }

    @Transactional(readOnly = true)
    public BigDecimal balance(UUID userId, String currency) {
        return walletRepo.findByUserIdAndCurrency(userId, currency)
            .map(PlayerWallet::getBalance).orElse(BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public List<WalletTransaction> transactions(UUID userId, int limit) {
        return txRepo.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, limit));
    }

    // ── Credit (earnings in) ─────────────────────────────────────────────────

    /** Credit earned money of any type (AD_REWARD / WELCOME_BONUS / PRIZE). */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void credit(UUID userId, String currency, BigDecimal amount,
                       String type, UUID referenceId, String note) {
        if (amount == null || amount.signum() <= 0) return;
        PlayerWallet w = lockOrCreate(userId, currency);
        BigDecimal before = w.getBalance();
        w.setBalance(before.add(amount));
        w.setLifetimeEarned(w.getLifetimeEarned().add(amount));
        walletRepo.save(w);
        record(userId, currency, type, amount, before, w.getBalance(), referenceId, note);
    }

    /** Credit prize money (kept as the tournament/prize entry point). */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void creditPrize(UUID userId, String currency, BigDecimal amount,
                            UUID referenceId, String note) {
        credit(userId, currency, amount, "PRIZE", referenceId, note);
    }

    // ── Withdrawal holds (used only by WithdrawalService) ───────────────────

    /** Debit {@code amount} as a withdrawal hold, failing if the balance is short. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void hold(UUID userId, String currency, BigDecimal amount, UUID withdrawalId) {
        PlayerWallet w = walletRepo.lockByUserIdAndCurrency(userId, currency)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "You don't have a " + currency + " balance to withdraw from."));
        if (w.getBalance().compareTo(amount) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Not enough balance: you have " + w.getBalance().stripTrailingZeros().toPlainString()
                + " " + currency + ".");
        }
        BigDecimal before = w.getBalance();
        w.setBalance(before.subtract(amount));
        walletRepo.save(w);
        record(userId, currency, "WITHDRAW_HOLD", amount.negate(), before, w.getBalance(),
            withdrawalId, null);
    }

    /** Return a held amount after a payout definitively fails. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void refundHold(UUID userId, String currency, BigDecimal amount,
                           UUID withdrawalId, String note) {
        PlayerWallet w = lockOrCreate(userId, currency);
        BigDecimal before = w.getBalance();
        w.setBalance(before.add(amount));
        walletRepo.save(w);
        record(userId, currency, "WITHDRAW_REFUND", amount, before, w.getBalance(),
            withdrawalId, note);
    }

    /** Count a delivered payout in lifetime_withdrawn (the hold already debited it). */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void markWithdrawn(UUID userId, String currency, BigDecimal amount) {
        PlayerWallet w = lockOrCreate(userId, currency);
        w.setLifetimeWithdrawn(w.getLifetimeWithdrawn().add(amount));
        walletRepo.save(w);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private PlayerWallet lockOrCreate(UUID userId, String currency) {
        return walletRepo.lockByUserIdAndCurrency(userId, currency).orElseGet(() ->
            walletRepo.save(PlayerWallet.builder().userId(userId).currency(currency).build()));
    }

    private void record(UUID userId, String currency, String type, BigDecimal delta,
                        BigDecimal before, BigDecimal after, UUID referenceId, String note) {
        txRepo.save(WalletTransaction.builder()
            .userId(userId).currency(currency).type(type).amountDelta(delta)
            .balanceBefore(before).balanceAfter(after)
            .referenceId(referenceId).note(note)
            .build());
    }
}
