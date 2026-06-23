package com.gridclan;

import com.gridclan.service.LeaderboardService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.*;

import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LeaderboardServiceTest {

    @Mock RedisTemplate<String, String> redis;
    @Mock ZSetOperations<String, String> zsetOps;
    @Mock ValueOperations<String, String> valueOps;

    @InjectMocks LeaderboardService service;

    private final UUID TOURNAMENT = UUID.randomUUID();
    private final UUID USER_A     = UUID.randomUUID();
    private final UUID USER_B     = UUID.randomUUID();

    @BeforeEach
    void setup() {
        when(redis.opsForZSet()).thenReturn(zsetOps);
        // Only the submitScore path touches these — lenient so the read-only
        // tests don't trip strict-stubbing
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
        lenient().when(valueOps.getOperations()).thenReturn(redis);
    }

    // ── submitScore ───────────────────────────────────────────────────────

    @Test @DisplayName("submitScore: adds entry when no prior score exists")
    void submitScore_newEntry_added() {
        when(zsetOps.score(anyString(), anyString())).thenReturn(null);  // No prior score
        when(zsetOps.add(any(), any(), anyDouble())).thenReturn(true);
        when(redis.expire(any(), any())).thenReturn(true);

        service.submitScore(TOURNAMENT, USER_A, "PlayerA", 850);

        verify(zsetOps).add(
            eq("leaderboard:" + TOURNAMENT),
            eq(USER_A + ":PlayerA"),
            eq(850.0));
    }

    @Test @DisplayName("submitScore: updates only when new score is higher")
    void submitScore_higherScore_updates() {
        when(zsetOps.score(anyString(), anyString())).thenReturn(600.0);  // Existing score
        when(zsetOps.add(any(), any(), anyDouble())).thenReturn(false);
        when(redis.expire(any(), any())).thenReturn(true);

        service.submitScore(TOURNAMENT, USER_A, "PlayerA", 850);  // 850 > 600
        verify(zsetOps).add(any(), any(), eq(850.0));
    }

    @Test @DisplayName("submitScore: does NOT update when new score is lower")
    void submitScore_lowerScore_skipped() {
        when(zsetOps.score(anyString(), anyString())).thenReturn(900.0);  // Existing score higher

        service.submitScore(TOURNAMENT, USER_A, "PlayerA", 500);  // 500 < 900
        verify(zsetOps, never()).add(any(), any(), anyDouble());
    }

    // ── getTopN ───────────────────────────────────────────────────────────

    @Test @DisplayName("getTopN: returns parsed leaderboard with ranks")
    void getTopN_returnsRankedList() {
        Set<ZSetOperations.TypedTuple<String>> raw = new LinkedHashSet<>();
        raw.add(new DefaultTypedTuple<>(USER_A + ":PlayerA", 900.0));
        raw.add(new DefaultTypedTuple<>(USER_B + ":PlayerB", 750.0));
        when(zsetOps.reverseRangeWithScores(any(), eq(0L), eq(99L))).thenReturn(raw);

        var result = service.getTopN(TOURNAMENT);

        assertThat(result).hasSize(2);
        assertThat(result.get(0)).containsEntry("rank", 1);
        assertThat(result.get(0)).containsEntry("score", 900);
        assertThat(result.get(0)).containsEntry("displayName", "PlayerA");
        assertThat(result.get(1)).containsEntry("rank", 2);
        assertThat(result.get(1)).containsEntry("score", 750);
    }

    @Test @DisplayName("getTopN: returns empty list when leaderboard is empty")
    void getTopN_empty_returnsEmptyList() {
        when(zsetOps.reverseRangeWithScores(any(), anyLong(), anyLong()))
            .thenReturn(Collections.emptySet());

        var result = service.getTopN(TOURNAMENT);
        assertThat(result).isEmpty();
    }

    // ── getPlayerRank ─────────────────────────────────────────────────────

    @Test @DisplayName("getPlayerRank: returns rank 1 for top player")
    void getPlayerRank_topPlayer_rank1() {
        String member = USER_A + ":PlayerA";
        when(zsetOps.reverseRank(any(), eq(member))).thenReturn(0L);  // 0-based
        when(zsetOps.score(anyString(), eq(member))).thenReturn(900.0);
        when(zsetOps.zCard(any())).thenReturn(50L);

        var result = service.getPlayerRank(TOURNAMENT, USER_A, "PlayerA");

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("rank",  1L);
        assertThat(result.get()).containsEntry("score", 900);
        assertThat(result.get()).containsEntry("total", 50L);
    }

    @Test @DisplayName("getPlayerRank: returns empty when player not on board")
    void getPlayerRank_notOnBoard_empty() {
        when(zsetOps.reverseRank(any(), any())).thenReturn(null);
        when(zsetOps.score(anyString(), anyString())).thenReturn(null);

        var result = service.getPlayerRank(TOURNAMENT, USER_A, "PlayerA");
        assertThat(result).isEmpty();
    }

    // Inner class needed for mock typed tuple
    static class DefaultTypedTuple<V> implements ZSetOperations.TypedTuple<V> {
        private final V value; private final Double score;
        DefaultTypedTuple(V v, Double s) { value = v; score = s; }
        @Override public V getValue() { return value; }
        @Override public Double getScore() { return score; }
        @Override public int compareTo(ZSetOperations.TypedTuple<V> o) {
            return Double.compare(score, o.getScore()); }
    }
}
