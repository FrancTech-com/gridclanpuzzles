package com.gridclan.controller;

import com.gridclan.entity.enums.GameType;
import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.repository.ActiveSessionRepository;
import com.gridclan.repository.PlayerStatsRepository;
import com.gridclan.repository.TournamentParticipantRepository;
import com.gridclan.repository.TournamentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Player achievements / lifetime record.
 *
 * GET /user/stats — the caller's wins/losses/draws for the three PvP board
 * games, split by play mode (solo vs computer, friend games, tournament
 * matches), plus Word Search solo totals and tournament participation.
 * Everything is aggregated live from the game tables — no extra state to
 * keep in sync.
 */
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class PlayerStatsController {

    private final PlayerStatsRepository           statsRepo;
    private final ActiveSessionRepository         sessionRepo;
    private final TournamentRepository            tournamentRepo;
    private final TournamentParticipantRepository participantRepo;

    private static final List<String> GAMES = List.of("SCRABBLE", "GOMOKU", "BATTLESHIP");
    private static final List<String> MODES = List.of("solo", "friend", "tournament");

    @GetMapping("/stats")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> myStats(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        // Zero-filled skeleton so the client always sees every game × mode.
        Map<String, Map<String, Map<String, Long>>> games = new LinkedHashMap<>();
        for (String game : GAMES) {
            Map<String, Map<String, Long>> modes = new LinkedHashMap<>();
            for (String mode : MODES) modes.put(mode, record(0, 0, 0));
            games.put(game, modes);
        }

        long wins = 0, losses = 0, draws = 0;
        for (Object[] row : statsRepo.winLossByGameAndMode(userId)) {
            String game = String.valueOf(row[0]);
            String mode = String.valueOf(row[1]).toLowerCase();
            long w = ((Number) row[2]).longValue();
            long l = ((Number) row[3]).longValue();
            long d = ((Number) row[4]).longValue();
            Map<String, Map<String, Long>> modes = games.get(game);
            if (modes != null) modes.put(mode, record(w, l, d));
            wins += w; losses += l; draws += d;
        }

        long played = wins + losses + draws;
        Map<String, Object> overall = new LinkedHashMap<>();
        overall.put("wins",    wins);
        overall.put("losses",  losses);
        overall.put("draws",   draws);
        overall.put("games",   played);
        overall.put("winRate", played == 0 ? 0 : Math.round(100.0 * wins / played));

        Map<String, Object> wordSearch = Map.of(
            "completed", sessionRepo.countByUserIdAndGameTypeAndStatus(
                             userId, GameType.WORD_SEARCH, SessionStatus.COMPLETED),
            "bestScore", sessionRepo.bestScore(userId, GameType.WORD_SEARCH, SessionStatus.COMPLETED));

        Map<String, Object> tournaments = Map.of(
            "joined", participantRepo.countByUserId(userId),
            "titles", tournamentRepo.countByWinnerId(userId));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("overall",     overall);
        body.put("games",       games);
        body.put("wordSearch",  wordSearch);
        body.put("tournaments", tournaments);
        return ResponseEntity.ok(body);
    }

    private static Map<String, Long> record(long wins, long losses, long draws) {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("wins", wins);
        m.put("losses", losses);
        m.put("draws", draws);
        return m;
    }
}
