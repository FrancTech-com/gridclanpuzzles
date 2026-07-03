package com.gridclan;

import com.gridclan.entity.GomokuGame;
import com.gridclan.entity.ScrabbleGame;
import com.gridclan.entity.TournamentMatch;
import com.gridclan.repository.GomokuGameRepository;
import com.gridclan.repository.PlayerStatsRepository;
import com.gridclan.repository.ScrabbleGameRepository;
import com.gridclan.repository.TournamentMatchRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the cross-table native aggregate behind GET /user/stats:
 * wins/losses/draws per game type, split into SOLO (vs_computer),
 * TOURNAMENT (game referenced by tournament_matches) and FRIEND (the rest).
 */
@DataJpaTest
@ActiveProfiles("test")
class PlayerStatsRepositoryTest {

    @Autowired PlayerStatsRepository    statsRepo;
    @Autowired GomokuGameRepository     gomokuRepo;
    @Autowired ScrabbleGameRepository   scrabbleRepo;
    @Autowired TournamentMatchRepository matchRepo;

    private static final UUID ME       = UUID.randomUUID();
    private static final UUID FRIEND   = UUID.randomUUID();
    private static final UUID COMPUTER = new UUID(0L, 0L);

    private GomokuGame gomoku(UUID p2, UUID winner, boolean vsComputer, String status) {
        return gomokuRepo.save(GomokuGame.builder()
            .inviteCode(UUID.randomUUID().toString().substring(0, 10))
            .player1Id(ME).player2Id(p2).winnerId(winner)
            .vsComputer(vsComputer).status(status)
            .board("").build());
    }

    private ScrabbleGame scrabble(UUID p2, UUID winner) {
        return scrabbleRepo.save(ScrabbleGame.builder()
            .inviteCode(UUID.randomUUID().toString().substring(0, 10))
            .player1Id(ME).player2Id(p2).winnerId(winner)
            .vsComputer(false).status("COMPLETE")
            .board("").bag("").rack1("").rack2("").build());
    }

    @Test
    void aggregatesWinsLossesDrawsByGameAndMode() {
        // Gomoku friend games: 2 wins, 1 loss, 1 draw (+1 ACTIVE ignored)
        gomoku(FRIEND, ME, false, "COMPLETE");
        gomoku(FRIEND, ME, false, "COMPLETE");
        gomoku(FRIEND, FRIEND, false, "COMPLETE");
        gomoku(FRIEND, null, false, "COMPLETE");
        gomoku(FRIEND, null, false, "ACTIVE");

        // Gomoku solo: 1 win, 1 loss vs computer
        gomoku(COMPUTER, ME, true, "COMPLETE");
        gomoku(COMPUTER, COMPUTER, true, "COMPLETE");

        // Scrabble tournament match: 1 win
        ScrabbleGame match = scrabble(FRIEND, ME);
        matchRepo.save(TournamentMatch.builder()
            .tournamentId(UUID.randomUUID()).round(1).slot(0)
            .player1Id(ME).player2Id(FRIEND)
            .gameType("SCRABBLE").gameId(match.getId()).build());

        // Someone else's game must not count
        scrabbleRepo.save(ScrabbleGame.builder()
            .inviteCode("other-game").player1Id(FRIEND).player2Id(UUID.randomUUID())
            .winnerId(FRIEND).vsComputer(false).status("COMPLETE")
            .board("").bag("").rack1("").rack2("").build());

        Map<String, long[]> byKey = new HashMap<>();
        for (Object[] row : statsRepo.winLossByGameAndMode(ME)) {
            byKey.put(row[0] + "/" + row[1], new long[]{
                ((Number) row[2]).longValue(),
                ((Number) row[3]).longValue(),
                ((Number) row[4]).longValue()});
        }

        assertThat(byKey.get("GOMOKU/FRIEND")).containsExactly(2, 1, 1);
        assertThat(byKey.get("GOMOKU/SOLO")).containsExactly(1, 1, 0);
        assertThat(byKey.get("SCRABBLE/TOURNAMENT")).containsExactly(1, 0, 0);
        assertThat(byKey).doesNotContainKey("SCRABBLE/FRIEND");
        assertThat(byKey).doesNotContainKey("BATTLESHIP/FRIEND");
    }

    @Test
    void emptyForUserWithNoGames() {
        assertThat(statsRepo.winLossByGameAndMode(UUID.randomUUID())).isEmpty();
    }
}
