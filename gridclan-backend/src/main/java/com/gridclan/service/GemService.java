package com.gridclan.service;

import com.gridclan.entity.GemTransaction;
import com.gridclan.entity.PlayerGems;
import com.gridclan.entity.User;
import com.gridclan.exception.AccountNotFoundException;
import com.gridclan.exception.DuplicateRewardException;
import com.gridclan.exception.GiftLimitExceededException;
import com.gridclan.exception.InsufficientGemsException;
import com.gridclan.repository.GemTransactionRepository;
import com.gridclan.repository.PlayerGemsRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Gems are a CLOSED-LOOP in-game currency. They are earned through play,
 * gifted between friends, and consumed (burned) on in-game actions.
 *
 * CRITICAL INVARIANT: gems have NO exit to real value. They can never be
 * converted to money, crypto, points-for-money, or any tradable asset, and
 * cannot be sold. This keeps them legally identical to any mobile-game
 * currency (Candy Crush lives, Clash of Clans gems, etc.).
 *
 * Concurrency: every mutation takes a pessimistic lock (SELECT FOR UPDATE).
 * Gifts lock BOTH accounts in a consistent order (lower UUID first) to
 * prevent deadlocks.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GemService {

    private final PlayerGemsRepository      gemsRepo;
    private final GemTransactionRepository  txRepo;
    private final UserRepository            userRepo;
    private final RedisTemplate<String, String> redis;

    @Value("${gridclan.gems.daily-gift-limit:500}")
    private long dailyGiftLimit;

    @Value("${gridclan.gems.ad-reward:10}")
    private long adReward;

    // ── Reads ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PlayerGems getBalance(UUID userId) {
        return gemsRepo.findByUserId(userId)
            .orElseGet(() -> PlayerGems.builder().userId(userId).build());
    }

    // ── Credit (earn) ─────────────────────────────────────────────────────

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void creditGems(UUID userId, long amount, String type, UUID referenceId) {
        if (amount <= 0) return;
        PlayerGems acct = lockOrCreate(userId);
        long before = acct.getBalance();
        acct.setBalance(before + amount);
        acct.setLifetimeEarned(acct.getLifetimeEarned() + amount);
        gemsRepo.save(acct);
        record(userId, type, amount, before, acct.getBalance(), null, referenceId, null);
    }

    // ── Spend (burn) ──────────────────────────────────────────────────────

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void spendGems(UUID userId, long amount, String type, UUID referenceId) {
        if (amount <= 0) throw new IllegalArgumentException("Spend amount must be positive");
        PlayerGems acct = gemsRepo.findByUserIdForUpdate(userId)
            .orElseThrow(AccountNotFoundException::new);
        if (acct.getBalance() < amount)
            throw new InsufficientGemsException(
                "Balance: " + acct.getBalance() + ", required: " + amount);
        long before = acct.getBalance();
        acct.setBalance(before - amount);
        acct.setLifetimeSpent(acct.getLifetimeSpent() + amount);
        gemsRepo.save(acct);
        record(userId, type, -amount, before, acct.getBalance(), null, referenceId, null);
    }

    // ── Gift (player → player, NOT a sale — no money changes hands) ────────

    @Transactional(isolation = Isolation.SERIALIZABLE)
    public void giftGems(UUID senderId, UUID recipientId, long amount, String note) {
        if (amount <= 0) throw new IllegalArgumentException("Gift amount must be positive");
        if (senderId.equals(recipientId))
            throw new IllegalArgumentException("You cannot gift gems to yourself.");

        // Recipient must exist and be in good standing.
        User recipient = userRepo.findById(recipientId)
            .orElseThrow(() -> new IllegalArgumentException("Recipient not found."));
        if (recipient.isPendingDeletion() || !recipient.isActive() || recipient.isSuspended())
            throw new IllegalArgumentException("Recipient cannot receive gems.");

        // Daily gift cap (Redis counter, resets at UTC midnight).
        enforceDailyGiftLimit(senderId, amount);

        // Deadlock-safe: always lock the lower UUID first.
        PlayerGems first, second;
        boolean senderIsFirst = senderId.compareTo(recipientId) < 0;
        UUID firstId  = senderIsFirst ? senderId : recipientId;
        UUID secondId = senderIsFirst ? recipientId : senderId;
        first  = lockOrCreate(firstId);
        second = lockOrCreate(secondId);
        PlayerGems sender    = senderIsFirst ? first : second;
        PlayerGems recipientAcct = senderIsFirst ? second : first;

        if (sender.getBalance() < amount)
            throw new InsufficientGemsException(
                "Balance: " + sender.getBalance() + ", required: " + amount);

        long sBefore = sender.getBalance();
        sender.setBalance(sBefore - amount);
        sender.setLifetimeSpent(sender.getLifetimeSpent() + amount);
        sender.setLifetimeGifted(sender.getLifetimeGifted() + amount);

        long rBefore = recipientAcct.getBalance();
        recipientAcct.setBalance(rBefore + amount);
        recipientAcct.setLifetimeReceived(recipientAcct.getLifetimeReceived() + amount);

        gemsRepo.save(sender);
        gemsRepo.save(recipientAcct);

        // Two ledger rows for audit (both sides).
        record(senderId,    "GIFT_SENT",     -amount, sBefore, sender.getBalance(),
            recipientId, null, note);
        record(recipientId, "GIFT_RECEIVED",  amount, rBefore, recipientAcct.getBalance(),
            senderId, null, note);

        log.info("Gift: {} -> {} amount={}", senderId, recipientId, amount);
    }

    // ── Rewarded ad (idempotent, server-fixed amount) ─────────────────────

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public long claimAdReward(UUID userId, UUID adSessionId) {
        if (txRepo.existsByReferenceIdAndType(adSessionId, "AD_REWARD"))
            throw new DuplicateRewardException("Ad session already rewarded: " + adSessionId);
        creditGems(userId, adReward, "AD_REWARD", adSessionId);
        return adReward;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private PlayerGems lockOrCreate(UUID userId) {
        return gemsRepo.findByUserIdForUpdate(userId).orElseGet(() ->
            gemsRepo.save(PlayerGems.builder().userId(userId).build()));
    }

    private void enforceDailyGiftLimit(UUID senderId, long amount) {
        String key = "gift:" + senderId + ":" + LocalDate.now();
        Long total = redis.opsForValue().increment(key, amount);
        if (total != null && total == amount) {
            redis.expire(key, Duration.ofDays(2));   // safety margin past midnight
        }
        if (total != null && total > dailyGiftLimit) {
            // roll back the counter so a rejected gift doesn't consume the cap
            redis.opsForValue().increment(key, -amount);
            throw new GiftLimitExceededException(
                "Daily gift limit of " + dailyGiftLimit + " gems exceeded.");
        }
    }

    private void record(UUID userId, String type, long delta, long before, long after,
                        UUID counterpartyId, UUID referenceId, String note) {
        txRepo.save(GemTransaction.builder()
            .userId(userId).type(type).gemsDelta(delta)
            .balanceBefore(before).balanceAfter(after)
            .counterpartyId(counterpartyId).referenceId(referenceId).note(note)
            .build());
    }
}
