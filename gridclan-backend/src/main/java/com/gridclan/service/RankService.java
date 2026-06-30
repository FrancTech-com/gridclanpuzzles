package com.gridclan.service;

import com.gridclan.entity.enums.PlayerRank;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Resolves a player's rank from their lifetime points and exposes the
 * rank-dependent rewards (gems per win, solo hint allowance). Lifetime points =
 * the points balance, which is a pure progression metric that is never spent.
 */
@Service
@RequiredArgsConstructor
public class RankService {

    private final PlayerPointsService pointsService;

    public PlayerRank rankOf(UUID userId) {
        return PlayerRank.fromPoints(pointsService.getBalance(userId));
    }

    /** Gems to award this user for a win, based on their current rank. */
    public long gemsPerWin(UUID userId) {
        return rankOf(userId).gemsPerWin;
    }

    /** Hints granted for a solo (vs-computer) game, based on rank (5 / 3 / 0). */
    public int soloHints(UUID userId) {
        return rankOf(userId).soloHints;
    }

    /**
     * Rank summary for the profile screen: current rank, lifetime points, the
     * next rank and how many points remain to reach it, plus a 0..1 progress
     * fraction within the current tier.
     */
    public Map<String, Object> summary(UUID userId) {
        long points     = pointsService.getBalance(userId);
        PlayerRank rank = PlayerRank.fromPoints(points);
        PlayerRank next = rank.next();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rank",       rank.name());
        m.put("rankLabel",  rank.label());
        m.put("points",     points);
        m.put("gemsPerWin", rank.gemsPerWin);
        m.put("soloHints",  rank.soloHints);

        if (next == null) {
            m.put("nextRank",      null);
            m.put("pointsToNext",  0L);
            m.put("progress",      1.0);
        } else {
            long span = next.minPoints - rank.minPoints;
            long into = points - rank.minPoints;
            m.put("nextRank",      next.name());
            m.put("nextRankLabel", next.label());
            m.put("pointsToNext",  Math.max(0, next.minPoints - points));
            m.put("progress",      span > 0 ? Math.min(1.0, (double) into / span) : 0.0);
        }
        return m;
    }
}
