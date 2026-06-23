package com.gridclan;

import com.gridclan.anticheat.AntiCheatEngine;
import com.gridclan.dto.MoveRequest;
import com.gridclan.dto.SessionStartRequest;
import com.gridclan.entity.ActiveSession;
import com.gridclan.entity.enums.GameTier;
import com.gridclan.entity.enums.GameType;
import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.exception.CheatDetectedException;
import com.gridclan.exception.HintsBlockedException;
import com.gridclan.exception.SessionNotFoundException;
import com.gridclan.repository.ActiveSessionRepository;
import com.gridclan.service.GameBoardGenerator;
import com.gridclan.service.GameSessionService;
import com.gridclan.service.GemService;
import com.gridclan.service.HintEngine;
import com.gridclan.service.LeaderboardService;
import com.gridclan.service.PlayerPointsService;
import com.gridclan.service.ScoreEngine;
import com.gridclan.service.TournamentService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GameSessionServiceTest {

    @Mock ActiveSessionRepository  sessionRepo;
    @Mock AntiCheatEngine          antiCheat;
    @Mock PlayerPointsService      pointsService;
    @Mock GemService               gemService;
    @Mock TournamentService        tournamentService;
    @Mock GameBoardGenerator       boardGenerator;
    @Mock ScoreEngine              scoreEngine;
    @Mock HintEngine               hintEngine;
    @Mock LeaderboardService       leaderboard;

    @InjectMocks
    GameSessionService service;

    private final UUID USER_ID    = UUID.randomUUID();
    private final UUID SESSION_ID = UUID.randomUUID();

    @BeforeEach
    void setup() {
        // @Value("${gridclan.gems.hint-cost}") — not injected outside Spring
        org.springframework.test.util.ReflectionTestUtils.setField(service, "hintCostGems", 10L);
    }

    // ── startSession ────────────────────────────────────────────────────────

    @Test
    @DisplayName("SOLO session: hintsAllowed = true (server hardcodes)")
    void startSession_solo_hintsAllowed() {
        when(boardGenerator.generate(any())).thenReturn(Map.of("type", "GRID_LOCKDOWN"));
        when(sessionRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        var req = SessionStartRequest.builder()
            .gameType(GameType.GRID_LOCKDOWN).tier(GameTier.SOLO).build();

        var response = service.startSession(USER_ID, req);

        assertThat(response.isHintsAllowed()).isTrue();
    }

    @Test
    @DisplayName("COMMUNITY_TOURNAMENT session: hintsAllowed = false (server hardcodes)")
    void startSession_tournament_hintsBlocked() {
        UUID tournamentId = UUID.randomUUID();
        when(boardGenerator.generate(any())).thenReturn(Map.of("type", "SUM_CIPHER"));
        when(sessionRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        doNothing().when(tournamentService).validateEntry(any(), any());

        var req = SessionStartRequest.builder()
            .gameType(GameType.SUM_CIPHER)
            .tier(GameTier.COMMUNITY_TOURNAMENT)
            .tournamentId(tournamentId)
            .build();

        var response = service.startSession(USER_ID, req);

        assertThat(response.isHintsAllowed()).isFalse();
    }

    // ── processMove ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("Move on non-existent session throws SessionNotFoundException")
    void processMove_sessionNotFound() {
        when(sessionRepo.findByIdAndUserId(any(), any())).thenReturn(Optional.empty());

        var req = MoveRequest.builder().sessionId(SESSION_ID).move(Map.of()).build();
        assertThatThrownBy(() -> service.processMove(USER_ID, req))
            .isInstanceOf(SessionNotFoundException.class);
    }

    @Test
    @DisplayName("Speed violation flags session and throws CheatDetectedException")
    void processMove_speedViolation_throws() {
        ActiveSession session = buildActiveSession(GameTier.SOLO);
        when(sessionRepo.findByIdAndUserId(any(), any())).thenReturn(Optional.of(session));
        doThrow(new CheatDetectedException("SPEED_VIOLATION: Move in 50ms (min allowed: 300ms)"))
            .when(antiCheat).validateMoveSpeed(any(), anyLong());

        var req = MoveRequest.builder().sessionId(SESSION_ID).move(Map.of()).build();
        assertThatThrownBy(() -> service.processMove(USER_ID, req))
            .isInstanceOf(CheatDetectedException.class)
            .hasMessageContaining("SPEED_VIOLATION");
    }

    // ── requestHint ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("Hint on tournament session throws HintsBlockedException")
    void requestHint_tournament_throws() {
        ActiveSession session = buildActiveSession(GameTier.COMMUNITY_TOURNAMENT);
        session.setHintsAllowed(false);
        when(sessionRepo.findByIdAndUserId(any(), any())).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> service.requestHint(USER_ID, SESSION_ID))
            .isInstanceOf(HintsBlockedException.class)
            .hasMessageContaining("Hints are disabled");
    }

    @Test
    @DisplayName("Hint on SOLO session spends gems and returns hint data")
    void requestHint_solo_succeeds() {
        ActiveSession session = buildActiveSession(GameTier.SOLO);
        session.setHintsAllowed(true);
        when(sessionRepo.findByIdAndUserId(any(), any())).thenReturn(Optional.of(session));
        when(hintEngine.compute(any(), any())).thenReturn(Map.of("type", "NODE_SUGGESTION"));
        when(sessionRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        var response = service.requestHint(USER_ID, SESSION_ID);

        verify(gemService).spendGems(eq(USER_ID), eq(10L), eq("HINT"), any());
        assertThat(response.getHintData()).isNotNull();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private ActiveSession buildActiveSession(GameTier tier) {
        return ActiveSession.builder()
            .id(SESSION_ID)
            .userId(USER_ID)
            .gameType(GameType.GRID_LOCKDOWN)
            .tier(tier)
            .boardState(new HashMap<>(Map.of("type", "GRID_LOCKDOWN", "solved", false)))
            .status(SessionStatus.ACTIVE)
            .hintsAllowed(tier != GameTier.COMMUNITY_TOURNAMENT)
            .startedAt(Instant.now().minusSeconds(30))
            .lastMoveAt(Instant.now().minusSeconds(5))
            .moveCount(0)
            .build();
    }
}
