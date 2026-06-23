package com.gridclan.service;

import com.gridclan.entity.LedgerTransaction;
import com.gridclan.entity.PlayerPoints;
import com.gridclan.exception.AccountNotFoundException;
import com.gridclan.exception.InsufficientBalanceException;
import com.gridclan.repository.LedgerTransactionRepository;
import com.gridclan.repository.PlayerPointsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlayerPointsService {
    private final PlayerPointsRepository      pointsRepo;
    private final LedgerTransactionRepository ledgerRepo;
    private final BalanceCache                balanceCache;

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void creditPoints(UUID userId, int pts, String type, UUID referenceId) {
        var account = pointsRepo.findByUserIdForUpdate(userId).orElseGet(() ->
            pointsRepo.save(PlayerPoints.builder().userId(userId).build()));
        long before = account.getBalance();
        account.setBalance(before + pts);
        account.setLifetimeEarned(account.getLifetimeEarned() + pts);
        pointsRepo.save(account);
        ledgerRepo.save(LedgerTransaction.builder()
            .userId(userId).type(type).pointsDelta(pts)
            .balanceBefore(before).balanceAfter(account.getBalance())
            .referenceId(referenceId).referenceType("GAME_SESSION").build());
        balanceCache.evict(userId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deductPoints(UUID userId, int pts, String type, UUID referenceId) {
        var account = pointsRepo.findByUserIdForUpdate(userId)
            .orElseThrow(AccountNotFoundException::new);
        if (account.getBalance() < pts)
            throw new InsufficientBalanceException("Balance: " + account.getBalance() + ", required: " + pts);
        long before = account.getBalance();
        account.setBalance(before - pts);
        account.setLifetimeSpent(account.getLifetimeSpent() + pts);
        pointsRepo.save(account);
        ledgerRepo.save(LedgerTransaction.builder()
            .userId(userId).type(type).pointsDelta(-pts)
            .balanceBefore(before).balanceAfter(account.getBalance())
            .referenceId(referenceId).referenceType("GAME_SESSION").build());
        balanceCache.evict(userId);
    }

    /**
     * Weekly community points share credit (called by CommunityDistributionJob).
     * Points are a pure progression metric — no money is involved.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void creditCommunityShare(UUID userId, long share, UUID communityId) {
        var account = pointsRepo.findByUserIdForUpdate(userId)
            .orElseThrow(AccountNotFoundException::new);
        long before = account.getBalance();
        account.setBalance(before + share);
        account.setLifetimeEarned(account.getLifetimeEarned() + share);
        pointsRepo.save(account);
        ledgerRepo.save(LedgerTransaction.builder()
            .userId(userId).type("COMMUNITY_DISTRIBUTION").pointsDelta(share)
            .balanceBefore(before).balanceAfter(account.getBalance())
            .referenceId(communityId).referenceType("COMMUNITY").build());
        balanceCache.evict(userId);
    }

    /**
     * Cache-aside, 60s TTL; cache miss reads the replica when one is
     * configured (read-only transaction). Display-only — authoritative paths
     * use findByUserIdForUpdate on the primary.
     */
    @Transactional(readOnly = true)
    public long getBalance(UUID userId) {
        return balanceCache.get(userId).orElseGet(() -> {
            long balance = pointsRepo.findByUserId(userId)
                .map(PlayerPoints::getBalance).orElse(0L);
            balanceCache.put(userId, balance);
            return balance;
        });
    }
}
