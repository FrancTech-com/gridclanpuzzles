package com.gridclan;

import com.gridclan.entity.User;
import com.gridclan.exception.DuplicateRequestException;
import com.gridclan.repository.*;
import com.gridclan.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountDeletionServiceTest {

    @Mock UserRepository              userRepo;
    @Mock PlayerPointsRepository      pointsRepo;
    @Mock PlayerGemsRepository        gemsRepo;
    @Mock GemTransactionRepository    gemTxRepo;
    @Mock CommunityMemberRepository   memberRepo;
    @Mock CommunityRepository         communityRepo;
    @Mock TournamentRepository        tournamentRepo;
    @Mock LedgerTransactionRepository ledgerRepo;
    @Mock ActiveSessionRepository     sessionRepo;
    @Mock NotificationService         notif;
    @Mock AuditLogService             audit;

    @InjectMocks AccountDeletionService service;

    private final UUID USER_ID = UUID.randomUUID();

    // ── Phase 1: requestDeletion ─────────────────────────────────────────

    @Test @DisplayName("requestDeletion: sets tombstone, deactivates, invalidates token")
    void requestDeletion_setsCorrectFields() {
        User user = buildActiveUser();
        when(userRepo.findById(USER_ID)).thenReturn(Optional.of(user));
        when(userRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        service.requestDeletion(USER_ID);

        assertThat(user.getDeletionRequestedAt()).isNotNull();
        assertThat(user.getDeletionTombstoneId()).isNotNull();
        assertThat(user.isActive()).isFalse();
        assertThat(user.getRefreshTokenHash()).isNull();  // Sessions invalidated
        verify(audit).record(eq(USER_ID), eq("DELETION_REQUESTED"), any());
    }

    @Test @DisplayName("requestDeletion: duplicate request throws DuplicateRequestException")
    void requestDeletion_duplicate_throws() {
        User user = buildActiveUser();
        user.setDeletionRequestedAt(Instant.now().minusSeconds(3600));
        when(userRepo.findById(USER_ID)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.requestDeletion(USER_ID))
            .isInstanceOf(DuplicateRequestException.class)
            .hasMessageContaining("already requested");
    }

    // ── Phase 2: executeErasure ──────────────────────────────────────────

    @Test @DisplayName("executeErasure: nulls all PII, calls anonymize ledger, zeros balance")
    void executeErasure_wipesAllPii() {
        User user = buildPendingDeletionUser();
        when(userRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        doNothing().when(ledgerRepo).anonymizeUserTransactions(any(), any());
        doNothing().when(memberRepo).deleteAllByUserId(any());
        doNothing().when(communityRepo).reassignOwner(any(), any());
        doNothing().when(sessionRepo).forfeitActiveSessions(any(), any());
        doNothing().when(tournamentRepo).removeParticipant(any());
        doNothing().when(pointsRepo).zeroOutBalance(any(), any());

        service.executeErasure(user);

        assertThat(user.getUsername()).isNull();
        assertThat(user.getEmail()).isNull();
        assertThat(user.getPhoneNumber()).isNull();
        assertThat(user.getPasswordHash()).isNull();
        assertThat(user.getDisplayName()).isEqualTo("[deleted]");
        assertThat(user.getAvatarUrl()).isNull();
        assertThat(user.getDeletedAt()).isNotNull();

        verify(ledgerRepo).anonymizeUserTransactions(eq(USER_ID), any());
        verify(pointsRepo).zeroOutBalance(eq(USER_ID), any());
        verify(audit).record(eq(USER_ID), eq("ERASURE_COMPLETE"), any());
    }

    // ── Cancel within appeal window ──────────────────────────────────────

    @Test @DisplayName("cancelDeletion: re-activates account, clears tombstone")
    void cancelDeletion_reactivatesAccount() {
        UUID tombstone = UUID.randomUUID();
        User user = buildPendingDeletionUser();
        user.setDeletionTombstoneId(tombstone);
        when(userRepo.findByDeletionTombstoneId(tombstone)).thenReturn(Optional.of(user));
        when(userRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        service.cancelDeletion(tombstone);

        assertThat(user.getDeletionRequestedAt()).isNull();
        assertThat(user.getDeletionTombstoneId()).isNull();
        assertThat(user.isActive()).isTrue();
        verify(audit).record(eq(USER_ID), eq("DELETION_CANCELLED"), any());
    }

    // ── Scheduled batch ──────────────────────────────────────────────────

    @Test @DisplayName("processScheduledErasures: skips users within 24h appeal window")
    void processScheduledErasures_skipsRecent() {
        // User requested deletion 12h ago — still in appeal window
        User recentUser = buildActiveUser();
        recentUser.setDeletionRequestedAt(Instant.now().minusSeconds(43200)); // 12h

        // findPendingDeletion returns only users OLDER than 24h
        when(userRepo.findPendingDeletion(any())).thenReturn(List.of());

        service.processScheduledErasures();

        verify(ledgerRepo, never()).anonymizeUserTransactions(any(), any());
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private User buildActiveUser() {
        return User.builder()
            .id(USER_ID)
            .username("testuser")
            .email("test@gridclan.gg")
            .phoneNumber("+256700000000")
            .passwordHash("$2b$12$hash")
            .displayName("Test User")
            .refreshTokenHash("$2b$12$refreshhash")
            .isActive(true)
            .role("USER")
            .build();
    }

    private User buildPendingDeletionUser() {
        User u = buildActiveUser();
        u.setDeletionRequestedAt(Instant.now().minus(java.time.Duration.ofDays(2)));
        u.setDeletionTombstoneId(UUID.randomUUID());
        u.setActive(false);
        return u;
    }
}
