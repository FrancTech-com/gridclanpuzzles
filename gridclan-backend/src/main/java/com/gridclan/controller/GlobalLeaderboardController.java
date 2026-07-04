package com.gridclan.controller;

import com.gridclan.repository.PlayerGamePointsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Global leaderboard endpoint.
 *
 * Ranks players by the skill points they have earned across the four games —
 * distinct from the per-tournament leaderboards in {@code TournamentController}.
 * Points are a PURE skill metric with no monetary value.
 *
 * Two modes on {@code GET /leaderboard/global}:
 *   • no game param → ranked by TOTAL points across all games, each entry
 *     carrying a per-game {@code games} breakdown.
 *   • {@code ?game=SCRABBLE} (or WORD_SEARCH/GOMOKU/BATTLESHIP) → ranked by that
 *     one game's points.
 *
 * Public (permitAll) so the guest-browsable home can show the panel. Only a
 * chosen display name and scores are exposed — never PII — and suspended /
 * inactive / pending-deletion accounts are filtered out at the query level.
 */
@RestController
@RequestMapping("/leaderboard")
@RequiredArgsConstructor
public class GlobalLeaderboardController {

    /** The games whose points feed the leaderboard. */
    private static final Set<String> GAME_KEYS =
        Set.of("WORD_SEARCH", "SCRABBLE", "GOMOKU", "BATTLESHIP", "CHESS", "MONOPOLY");

    private final PlayerGamePointsRepository gamePointsRepo;

    @GetMapping("/global")
    public ResponseEntity<Map<String, Object>> global(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String game) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);

        return (game != null && !game.isBlank())
            ? ResponseEntity.ok(perGame(game.trim().toUpperCase(Locale.ROOT), safeLimit))
            : ResponseEntity.ok(byTotal(safeLimit));
    }

    /** Ranked by total points across all games, with a per-game breakdown. */
    private Map<String, Object> byTotal(int limit) {
        List<Object[]> top = gamePointsRepo.findTopByTotal(PageRequest.of(0, limit));

        List<UUID> userIds = top.stream().map(r -> (UUID) r[0]).toList();
        // userId → { gameKey → points }
        Map<UUID, Map<String, Long>> breakdown = new HashMap<>();
        if (!userIds.isEmpty()) {
            for (Object[] row : gamePointsRepo.findBreakdownForUsers(userIds)) {
                breakdown
                    .computeIfAbsent((UUID) row[0], k -> new HashMap<>())
                    .put((String) row[1], ((Number) row[2]).longValue());
            }
        }

        List<Map<String, Object>> entries = new ArrayList<>(top.size());
        int rank = 1;
        for (Object[] row : top) {
            UUID userId = (UUID) row[0];
            Map<String, Long> games = breakdown.getOrDefault(userId, Map.of());

            Map<String, Object> entry = new HashMap<>();
            entry.put("rank",        rank++);
            entry.put("displayName", row[1]);
            entry.put("total",       ((Number) row[2]).longValue());
            entry.put("games",       games);
            entries.add(entry);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("leaderboard", entries);
        return response;
    }

    /** Ranked by a single game's points. */
    private Map<String, Object> perGame(String gameKey, int limit) {
        List<Map<String, Object>> entries = new ArrayList<>();
        if (GAME_KEYS.contains(gameKey)) {
            List<Object[]> rows = gamePointsRepo.findTopByGame(gameKey, PageRequest.of(0, limit));
            int rank = 1;
            for (Object[] row : rows) {
                Map<String, Object> entry = new HashMap<>();
                entry.put("rank",        rank++);
                entry.put("displayName", row[0]);
                entry.put("points",      ((Number) row[1]).longValue());
                entries.add(entry);
            }
        }
        Map<String, Object> response = new HashMap<>();
        response.put("leaderboard", entries);
        response.put("game", gameKey);
        return response;
    }
}
