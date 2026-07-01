package com.gridclan.service;

import com.gridclan.anticheat.AntiCheatEngine;
import com.gridclan.dto.*;
import com.gridclan.entity.ActiveSession;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameTier;
import com.gridclan.entity.enums.GameType;
import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.exception.*;
import com.gridclan.repository.ActiveSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Authoritative game session service.
 *
 * SECURITY INVARIANTS (from blueprint):
 *   - Server creates board state; client never does.
 *   - hintsAllowed is set server-side and CANNOT be overridden by client.
 *   - Score is computed server-side on every move; client never computes it.
 *   - Every move passes anti-cheat before board state updates.
 *   - Hint spends GEMS server-side; client flag is UX only.
 *
 * ECONOMY:
 *   - Points are a pure score/leaderboard metric (GAME_WIN), never spent.
 *   - Solving a puzzle awards a small gem reward (GAME_REWARD).
 *   - Hints / revive / replay are paid for in gems (consumed, never cashable).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GameSessionService {

    private final ActiveSessionRepository sessionRepo;
    private final AntiCheatEngine         antiCheat;
    private final PlayerPointsService     pointsService;
    private final GemService              gemService;
    private final RankService             rankService;
    private final TournamentService       tournamentService;
    private final GameBoardGenerator      boardGenerator;
    private final ScoreEngine             scoreEngine;
    private final HintEngine              hintEngine;
    private final LeaderboardService      leaderboard;
    private final LevelService            levelService;

    @Value("${gridclan.gems.hint-cost:10}")
    private long hintCostGems;

    @Value("${gridclan.gems.revive-cost:20}")
    private long reviveCostGems;

    @Value("${gridclan.gems.replay-cost:15}")
    private long replayCostGems;

    // ── Start Session ──────────────────────────────────────────────────────

    @Transactional
    public SessionStartResponse startSession(UUID userId, SessionStartRequest req) {
        boolean isTournament = req.getTier() == GameTier.COMMUNITY_TOURNAMENT;

        if (isTournament && req.getTournamentId() != null) {
            tournamentService.validateEntry(userId, req.getTournamentId());
        }

        // Difficulty ladder applies to SOLO play only. When chosen, the server
        // enforces the locked ladder, sizes the board, and tags the session so
        // scoring + completion are scaled. Client cannot override any of this.
        Difficulty difficulty = null;
        int level = 0;
        if (req.getTier() == GameTier.SOLO && req.getDifficulty() != null) {
            difficulty = req.getDifficulty();
            level = req.getLevel() != null ? req.getLevel() : 1;
            levelService.requireUnlocked(userId, req.getGameType(), difficulty, level);
        }

        Map<String, Object> board = difficulty != null
            ? boardGenerator.generate(req.getGameType(), difficulty, level)
            : boardGenerator.generate(req.getGameType());

        // Comfortable, difficulty-scaled move budget for ladder puzzles (0 = no
        // limit for non-ladder sessions). Derived from the actual word count.
        int moveLimit = difficulty != null ? difficulty.moveBudgetFor(wordCount(board)) : 0;

        ActiveSession session = ActiveSession.builder()
            .id(UUID.randomUUID())
            .userId(userId)
            .gameType(req.getGameType())
            .tier(req.getTier())
            .tournamentId(req.getTournamentId())
            .difficulty(difficulty)
            .level(level)
            .moveLimit(moveLimit)
            .boardState(board)
            .status(SessionStatus.ACTIVE)
            // ← SERVER HARDCODES THIS — client payload cannot override
            .hintsAllowed(!isTournament)
            .startedAt(Instant.now())
            .lastMoveAt(Instant.now())
            .build();

        sessionRepo.save(session);
        log.info("Session started: userId={} type={} tier={} diff={} level={} hints={}",
            userId, req.getGameType(), req.getTier(), difficulty, level, session.isHintsAllowed());

        return SessionStartResponse.from(session);
    }

    /**
     * Start a session on a CALLER-SUPPLIED board (used by async friend
     * challenges so both players solve the identical puzzle). The board still
     * comes from the server — never the client — so the trust model holds.
     * Always FRIEND tier with hints enabled; scoring is unchanged.
     */
    @Transactional
    public SessionStartResponse startWithBoard(UUID userId, GameType gameType,
                                               Map<String, Object> board) {
        ActiveSession session = ActiveSession.builder()
            .id(UUID.randomUUID())
            .userId(userId)
            .gameType(gameType)
            .tier(GameTier.FRIEND)
            .boardState(board)
            .status(SessionStatus.ACTIVE)
            .hintsAllowed(true)
            .startedAt(Instant.now())
            .lastMoveAt(Instant.now())
            .build();

        sessionRepo.save(session);
        log.info("Challenge session started: userId={} type={}", userId, gameType);
        return SessionStartResponse.from(session);
    }

    // ── Process Move ───────────────────────────────────────────────────────

    @Transactional
    public MoveResponse processMove(UUID userId, MoveRequest req) {
        ActiveSession session = sessionRepo
            .findByIdAndUserId(req.getSessionId(), userId)
            .orElseThrow(SessionNotFoundException::new);

        if (session.getStatus() != SessionStatus.ACTIVE) {
            throw new InvalidSessionStateException("Session is " + session.getStatus());
        }

        // Anti-Cheat #1: Speed check
        long msSinceLast = Instant.now().toEpochMilli()
            - session.getLastMoveAt().toEpochMilli();
        antiCheat.validateMoveSpeed(session.getGameType(), msSinceLast);

        // Anti-Cheat #2: Mathematical / geometric validity
        antiCheat.validateMoveLogic(
            session.getGameType(),
            session.getBoardState(),
            req.getMove(),
            userId,
            session.getId()
        );

        // Apply move server-side and compute new authoritative board
        var newBoard = boardGenerator.applyMove(
            session.getGameType(), session.getBoardState(), req.getMove());
        int newScore = scoreEngine.calculate(
            session.getGameType(), session.getMoveCount(), newBoard.isSolved(),
            session.getDifficulty(), session.getLevel());

        session.setBoardState(newBoard.getState());
        session.setServerScore(newScore);
        session.setMoveCount(session.getMoveCount() + 1);
        session.setLastMoveAt(Instant.now());

        if (newBoard.isSolved()) {
            session.setStatus(SessionStatus.COMPLETED);
            session.setCompletedAt(Instant.now());
            // Points → leaderboard / progression only (no value). Tagged
            // WORD_SEARCH so it feeds the per-game leaderboard breakdown.
            pointsService.creditGamePoints(userId, "WORD_SEARCH", newScore, "GAME_WIN", session.getId());
            // Gems → reward for solving, scaled by the player's rank
            // (Beginner 5 / Amateur 10 / Professional 15).
            gemService.creditGems(userId, rankService.gemsPerWin(userId),
                "GAME_REWARD", session.getId());
            // Ladder progress → record best score + unlock the next level.
            if (session.getDifficulty() != null) {
                levelService.recordCompletion(userId, session.getGameType(),
                    session.getDifficulty(), session.getLevel(), newScore);
            }
            if (session.getTournamentId() != null) {
                leaderboard.submitScore(session.getTournamentId(), userId,
                    userId.toString(), newScore);
            }
            log.info("Session completed: userId={} score={}", userId, newScore);
        } else if (session.getMoveLimit() > 0 && session.getMoveCount() >= session.getMoveLimit()) {
            // Out of moves — the player can revive (spend gems) for more, or give up.
            session.setStatus(SessionStatus.OUT_OF_MOVES);
            log.info("Session out of moves: userId={} moves={}/{}",
                userId, session.getMoveCount(), session.getMoveLimit());
        }

        sessionRepo.save(session);

        return MoveResponse.builder()
            .boardState(newBoard.getState())
            .score(newScore)
            .moveCount(session.getMoveCount())
            .moveLimit(session.getMoveLimit())
            .status(session.getStatus())
            .build();
    }

    // ── Hint Request (costs gems) ────────────────────────────────────────────

    @Transactional
    public HintResponse requestHint(UUID userId, UUID sessionId) {
        ActiveSession session = sessionRepo
            .findByIdAndUserId(sessionId, userId)
            .orElseThrow(SessionNotFoundException::new);

        // ── HARD SERVER RULE — not a client-side flag ─────────────────────
        if (!session.isHintsAllowed()) {
            throw new HintsBlockedException(
                "Hints are disabled for Community Tournament sessions.");
        }

        // Spend gems BEFORE returning the hint (prevents free hints on disconnect).
        gemService.spendGems(userId, hintCostGems, "HINT", session.getId());

        var hint = hintEngine.compute(session.getGameType(), session.getBoardState());
        sessionRepo.save(session);

        return HintResponse.builder()
            .boardState(session.getBoardState())
            .score(session.getServerScore())
            .hintData(hint)
            .build();
    }

    // ── Revive (costs gems; disabled for tournaments) ─────────────────────────

    @Transactional
    public MoveResponse revive(UUID userId, UUID sessionId) {
        ActiveSession session = sessionRepo
            .findByIdAndUserId(sessionId, userId)
            .orElseThrow(SessionNotFoundException::new);

        // Competitive integrity — no revives in tournaments.
        if (session.getTier() == GameTier.COMMUNITY_TOURNAMENT) {
            throw new InvalidSessionStateException(
                "Revive is disabled for Community Tournament sessions.");
        }

        gemService.spendGems(userId, reviveCostGems, "REVIVE", session.getId());

        session.setStatus(SessionStatus.ACTIVE);
        // Grant more moves so the player isn't immediately out again. Extend the
        // budget by another comfortable margin for the puzzle's word count.
        if (session.getMoveLimit() > 0) {
            int grant = Math.max(6, wordCount(session.getBoardState()));
            session.setMoveLimit(session.getMoveLimit() + grant);
        }
        session.setLastMoveAt(Instant.now());
        sessionRepo.save(session);

        return MoveResponse.builder()
            .boardState(session.getBoardState())
            .score(session.getServerScore())
            .moveCount(session.getMoveCount())
            .moveLimit(session.getMoveLimit())
            .status(session.getStatus())
            .build();
    }

    // ── Replay a game with the same friend (costs gems) ──────────────────────

    @Transactional
    public SessionStartResponse replayWithFriend(UUID userId, UUID friendId, GameType gameType) {
        if (userId.equals(friendId)) {
            throw new IllegalArgumentException("Cannot replay with yourself.");
        }
        gemService.spendGems(userId, replayCostGems, "REPLAY", null);

        ActiveSession session = ActiveSession.builder()
            .id(UUID.randomUUID())
            .userId(userId)
            .gameType(gameType)
            .tier(GameTier.FRIEND)
            .boardState(boardGenerator.generate(gameType))
            .status(SessionStatus.ACTIVE)
            .hintsAllowed(true)
            .startedAt(Instant.now())
            .lastMoveAt(Instant.now())
            .build();

        sessionRepo.save(session);
        log.info("Replay session started: userId={} friendId={} type={}", userId, friendId, gameType);
        return SessionStartResponse.from(session);
    }

    /** Number of words the board asks the player to find (for the move budget). */
    @SuppressWarnings("unchecked")
    private static int wordCount(Map<String, Object> board) {
        Object words = board == null ? null : board.get("words");
        return words instanceof List ? ((List<Object>) words).size() : 8;
    }

}
