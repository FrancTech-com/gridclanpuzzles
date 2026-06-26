package com.gridclan.anticheat;

import com.gridclan.entity.enums.GameType;
import com.gridclan.exception.CheatDetectedException;
import com.gridclan.repository.FlaggedEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Authoritative anti-cheat engine.
 *
 * Two checks run on every move:
 *   1. Speed gate  — rejects moves arriving faster than human-possible
 *   2. Logic gate  — rejects moves that are mathematically/geometrically impossible
 *
 * On violation: flags the session in DB, throws CheatDetectedException.
 * Client receives 403 with reason code; session status → FLAGGED.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AntiCheatEngine {

    private final FlaggedEventRepository flagRepo;

    /** Human-possible minimum milliseconds between moves, per game type. */
    private static final Map<GameType, Long> MIN_MOVE_MS = Map.of(
        GameType.WORD_SEARCH, 250L      // 250ms minimum per word selection
    );

    // ── Speed Check ────────────────────────────────────────────────────────

    public void validateMoveSpeed(GameType type, long msSinceLastMove) {
        long minMs = MIN_MOVE_MS.getOrDefault(type, 250L);
        if (msSinceLastMove < minMs) {
            flagAndThrow(type, null, null, "SPEED_VIOLATION",
                String.format("Move in %dms (min allowed: %dms)", msSinceLastMove, minMs));
        }
    }

    // ── Logic Check ────────────────────────────────────────────────────────

    public void validateMoveLogic(GameType type,
                                  Object boardState,
                                  Object move,
                                  UUID userId,
                                  UUID sessionId) {
        boolean valid = switch (type) {
            case WORD_SEARCH -> WordSearchValidator.isLegalMove(boardState, move);
        };

        if (!valid) {
            flagAndThrow(type, userId, sessionId, "IMPOSSIBLE_MOVE",
                "Move is mathematically/geometrically impossible given current board state");
        }
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private void flagAndThrow(GameType type, UUID userId, UUID sessionId,
                               String reason, String detail) {
        try {
            flagRepo.save(com.gridclan.entity.FlaggedEvent.builder()
                .userId(userId)
                .sessionId(sessionId)
                .gameType(type.name())
                .reason(reason)
                .detail(detail)
                .flaggedAt(Instant.now())
                .build());
        } catch (Exception e) {
            log.error("Failed to persist flag event: {}", e.getMessage());
        }
        log.warn("Anti-cheat violation [{}/{}]: {}", type, reason, detail);
        throw new CheatDetectedException(reason + ": " + detail);
    }
}
