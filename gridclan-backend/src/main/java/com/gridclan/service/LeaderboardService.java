package com.gridclan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;

/**
 * Real-time tournament leaderboard backed by Redis sorted sets.
 *
 * Key schema:
 *   leaderboard:{tournamentId}  → ZSET   score=points, member=userId:displayName
 *   lb_meta:{tournamentId}      → STRING  TTL marker — expires with tournament
 *
 * Operations:
 *   ZADD   — submit/update a player's score (O(log N))
 *   ZREVRANGE WITHSCORES — top-N leaderboard (O(log N + M))
 *   ZRANK  — player's current rank (O(log N))
 *   ZCARD  — total participants count (O(1))
 *
 * TTL: leaderboard keys expire 7 days after tournament end.
 * Update path: GameSessionService calls submitScore() when a tournament
 *              session completes (status → COMPLETED).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LeaderboardService {

    private final RedisTemplate<String, String> redis;

    private static final String KEY_PREFIX  = "leaderboard:";
    private static final int    TOP_N       = 100;
    private static final Duration TTL       = Duration.ofDays(7);

    // ── Submit / update score ──────────────────────────────────────────────

    /**
     * Called by GameSessionService when a tournament session completes.
     * Uses ZADD with NX flag equivalent — only updates if new score is HIGHER.
     *
     * @param tournamentId  tournament UUID
     * @param userId        player UUID
     * @param displayName   player display name (included in member for display)
     * @param score         final session score (server-computed)
     */
    public void submitScore(UUID tournamentId, UUID userId, String displayName, int score) {
        String key    = KEY_PREFIX + tournamentId;
        String member = userId + ":" + displayName;

        ZSetOperations<String, String> zset = redis.opsForValue().getOperations().opsForZSet();

        // Only update if new score beats existing best
        Double current = zset.score(key, member);
        if (current == null || score > current) {
            zset.add(key, member, score);
            redis.expire(key, TTL);
            log.debug("Leaderboard updated: tournament={} user={} score={}", tournamentId, userId, score);
        }
    }

    // ── Top-N leaderboard ──────────────────────────────────────────────────

    /**
     * Returns the top-100 players by score, descending.
     * Each entry: {rank, userId, displayName, score}
     */
    public List<Map<String, Object>> getTopN(UUID tournamentId) {
        return getTopN(tournamentId, TOP_N);
    }

    public List<Map<String, Object>> getTopN(UUID tournamentId, int n) {
        String key = KEY_PREFIX + tournamentId;
        ZSetOperations<String, String> zset = redis.opsForZSet();

        Set<ZSetOperations.TypedTuple<String>> raw =
            zset.reverseRangeWithScores(key, 0, Math.min(n, TOP_N) - 1);

        if (raw == null || raw.isEmpty()) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        int rank = 1;
        for (ZSetOperations.TypedTuple<String> entry : raw) {
            String member = entry.getValue();
            if (member == null) continue;

            String[] parts = member.split(":", 2);
            String userId  = parts.length > 0 ? parts[0] : "unknown";
            String name    = parts.length > 1 ? parts[1] : "Player";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank",        rank++);
            row.put("userId",      userId);
            row.put("displayName", name);
            row.put("score",       entry.getScore() != null
                                       ? entry.getScore().intValue() : 0);
            result.add(row);
        }
        return result;
    }

    // ── Player rank lookup ─────────────────────────────────────────────────

    /**
     * Returns a player's current rank (1-based) and score, or empty if not on board.
     */
    public Optional<Map<String, Object>> getPlayerRank(UUID tournamentId,
                                                        UUID userId,
                                                        String displayName) {
        String key    = KEY_PREFIX + tournamentId;
        String member = userId + ":" + displayName;
        ZSetOperations<String, String> zset = redis.opsForZSet();

        Long   rankZero = zset.reverseRank(key, member);   // 0-based
        Double score    = zset.score(key, member);

        if (rankZero == null || score == null) return Optional.empty();

        return Optional.of(Map.of(
            "rank",  rankZero + 1,
            "score", score.intValue(),
            "total", Objects.requireNonNullElse(zset.zCard(key), 0L)
        ));
    }

    // ── Participant count ──────────────────────────────────────────────────

    public long getParticipantCount(UUID tournamentId) {
        Long count = redis.opsForZSet().zCard(KEY_PREFIX + tournamentId);
        return count != null ? count : 0L;
    }

    // ── Expire leaderboard (called when tournament closes) ────────────────

    public void expireLeaderboard(UUID tournamentId) {
        redis.expire(KEY_PREFIX + tournamentId, TTL);
        log.info("Leaderboard TTL set for tournament={}", tournamentId);
    }
}
