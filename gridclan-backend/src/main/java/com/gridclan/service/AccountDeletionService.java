package com.gridclan.service;

import com.gridclan.entity.User;
import com.gridclan.exception.DuplicateRequestException;
import com.gridclan.exception.UserNotFoundException;
import com.gridclan.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Two-phase account deletion pipeline.
 *
 * PHASE 1 — Immediate (user taps "Delete My Account"):
 *   - Set deletion_requested_at, generate tombstone UUID
 *   - Set is_active=false — blocks JWT auth immediately
 *   - Invalidate refresh token — forces logout
 *   - 24-hour appeal window before Phase 2 runs
 *
 * PHASE 2 — Async Erasure (nightly at 03:00 EAT):
 *   - Anonymize ledger: user_id=NULL, tombstone_id=UUID (AML trail preserved)
 *   - Delete community memberships
 *   - Reassign owned communities to system account
 *   - Forfeit active game sessions / tournament slots
 *   - Zero out points balance
 *   - NULL all PII fields in users row
 *
 * Compliance: GDPR / Uganda DPA 2019 — PII erased within 30 days.
 * AML: Bank of Uganda — financial records permanent, identity decoupled.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountDeletionService {

    private final UserRepository              userRepo;
    private final PlayerPointsRepository      pointsRepo;
    private final PlayerGemsRepository        gemsRepo;
    private final GemTransactionRepository    gemTxRepo;
    private final CommunityMemberRepository   memberRepo;
    private final CommunityRepository         communityRepo;
    private final TournamentRepository        tournamentRepo;
    private final LedgerTransactionRepository ledgerRepo;
    private final ActiveSessionRepository     sessionRepo;
    private final NotificationService         notif;
    private final AuditLogService             audit;

    private static final UUID SYSTEM_ACCOUNT =
        UUID.fromString("00000000-0000-0000-0000-000000000001");

    // ── PHASE 1: Immediate ────────────────────────────────────────────────

    @Transactional
    public void requestDeletion(UUID userId) {
        User user = userRepo.findById(userId)
            .orElseThrow(UserNotFoundException::new);

        if (user.getDeletionRequestedAt() != null) {
            throw new DuplicateRequestException("Deletion already requested.");
        }

        UUID tombstone = UUID.randomUUID();
        user.setDeletionRequestedAt(Instant.now());
        user.setDeletionTombstoneId(tombstone);
        user.setActive(false);              // Block JWT auth immediately
        user.setRefreshTokenHash(null);     // Invalidate all sessions NOW
        userRepo.save(user);

        // Notification may fail — don't let it abort the deletion
        try { notif.sendDeletionConfirmation(user.getEmail(), tombstone); }
        catch (Exception e) { log.warn("Deletion email failed for {}: {}", userId, e.getMessage()); }

        audit.record(userId, "DELETION_REQUESTED", "tombstone=" + tombstone);
        log.info("Deletion requested: userId={} tombstone={}", userId, tombstone);
    }

    // ── PHASE 2: Async Nightly Erasure ────────────────────────────────────

    /**
     * Runs nightly at 03:00 EAT (Africa/Kampala).
     * 24h cool-down gives user the appeal window before irreversible erasure.
     * Propagation.NOT_SUPPORTED — each user's erasure gets its own transaction
     * so one failure doesn't abort the entire batch.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "Africa/Kampala")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void processScheduledErasures() {
        Instant cutoff = Instant.now().minus(1, ChronoUnit.DAYS);
        userRepo.findPendingDeletion(cutoff).forEach(user -> {
            try {
                executeErasure(user);
            } catch (Exception e) {
                log.error("Erasure failed for tombstone={}: {}",
                    user.getDeletionTombstoneId(), e.getMessage(), e);
                audit.record(user.getId(), "ERASURE_FAILED", e.getMessage());
            }
        });
    }

    @Transactional(isolation = Isolation.SERIALIZABLE)
    public void executeErasure(User user) {
        UUID userId    = user.getId();
        UUID tombstone = user.getDeletionTombstoneId();

        // 1. Anonymize ledger — RETAIN rows, REMOVE identity link
        //    SQL: UPDATE ledger_transactions
        //         SET user_id=NULL, tombstone_id=:tombstone WHERE user_id=:userId
        ledgerRepo.anonymizeUserTransactions(userId, tombstone);

        // 2. Remove community memberships (CASCADE would handle this,
        //    but we call explicitly for auditing purposes)
        memberRepo.deleteAllByUserId(userId);

        // 3. Reassign owned communities to system account
        communityRepo.reassignOwner(userId, SYSTEM_ACCOUNT);

        // 4. Forfeit active game sessions and tournament slots
        sessionRepo.forfeitActiveSessions(userId, Instant.now());
        tournamentRepo.removeParticipant(userId);

        // 5. Zero out points and gems (closed-loop, no value — simply cleared)
        pointsRepo.zeroOutBalance(userId, Instant.now());
        gemsRepo.zeroOutBalance(userId, Instant.now());
        gemTxRepo.anonymizeUserTransactions(userId, tombstone);

        // 6. Wipe all PII fields — user row stays for aggregate stats
        user.setUsername(null);
        user.setEmail(null);
        user.setEmailVerified(false);
        user.setPhoneNumber(null);
        user.setPasswordHash(null);
        user.setDisplayName("[deleted]");
        user.setAvatarUrl(null);
        user.setDeviceToken(null);
        user.setRefreshTokenHash(null);
        user.setDeletedAt(Instant.now());
        userRepo.save(user);

        audit.record(userId, "ERASURE_COMPLETE", "tombstone=" + tombstone);
        log.info("Erasure complete: tombstone={}", tombstone);
    }

    // ── Cancel within 24h appeal window ───────────────────────────────────
    // Uses tombstone UUID as proof (user is already logged out — no JWT)

    @Transactional
    public void cancelDeletion(UUID tombstoneId) {
        User user = userRepo.findByDeletionTombstoneId(tombstoneId)
            .orElseThrow(() -> new EntityNotFoundException("Invalid tombstone"));

        user.setDeletionRequestedAt(null);
        user.setDeletionTombstoneId(null);
        user.setActive(true);
        userRepo.save(user);

        audit.record(user.getId(), "DELETION_CANCELLED", "tombstone=" + tombstoneId);
        log.info("Deletion cancelled: tombstoneId={}", tombstoneId);
    }
}
