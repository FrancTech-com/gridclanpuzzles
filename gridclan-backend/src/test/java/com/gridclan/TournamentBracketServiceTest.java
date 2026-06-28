package com.gridclan;

import com.gridclan.entity.Tournament;
import com.gridclan.entity.TournamentMatch;
import com.gridclan.entity.TournamentParticipant;
import com.gridclan.repository.*;
import com.gridclan.service.BattleshipGameService;
import com.gridclan.service.GomokuGameService;
import com.gridclan.service.ScrabbleGameService;
import com.gridclan.service.TournamentBracketService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bracket engine: seed → reconcile → advance → champion, plus the bye path and
 * the <2-player cancel. Real repos (H2, no Redis); PvP services mocked so
 * "player1 always wins" makes outcomes deterministic.
 */
@DataJpaTest
@ActiveProfiles("test")
class TournamentBracketServiceTest {

    @Autowired TournamentRepository            tournamentRepo;
    @Autowired TournamentMatchRepository       matchRepo;
    @Autowired TournamentParticipantRepository participantRepo;
    @Autowired UserRepository                  userRepo;

    GomokuGameService     gomoku;
    ScrabbleGameService   scrabble;
    BattleshipGameService battleship;
    TournamentBracketService bracket;

    @BeforeEach
    void setup() {
        gomoku     = mock(GomokuGameService.class);
        scrabble   = mock(ScrabbleGameService.class);
        battleship = mock(BattleshipGameService.class);

        // Each created match gets a fresh game id; games are immediately "complete"
        // and player1 always wins (deterministic regardless of seeding shuffle).
        when(gomoku.createMatch(any(), any())).thenAnswer(i -> UUID.randomUUID());
        when(gomoku.isMatchComplete(any())).thenReturn(true);
        when(gomoku.matchWinner(any())).thenAnswer(inv -> {
            UUID gid = inv.getArgument(0);
            return matchRepo.findAll().stream()
                .filter(m -> gid.equals(m.getGameId()))
                .map(TournamentMatch::getPlayer1Id)
                .findFirst().orElse(null);
        });

        bracket = new TournamentBracketService(
            tournamentRepo, matchRepo, participantRepo, userRepo, scrabble, gomoku, battleship);
    }

    private Tournament newTournament() {
        return tournamentRepo.save(Tournament.builder()
            .name("Cup").gameType("GOMOKU").status("UPCOMING")
            .startsAt(Instant.now()).endsAt(Instant.now().plusSeconds(3600))
            .build());
    }

    private void join(Tournament t, int n) {
        for (int i = 0; i < n; i++)
            participantRepo.save(TournamentParticipant.builder()
                .tournamentId(t.getId()).userId(UUID.randomUUID()).status("ACTIVE").build());
    }

    private void runToCompletion(Tournament t) {
        int guard = 0;
        while ("ACTIVE".equals(t.getStatus()) && guard++ < 20) bracket.reconcile(t);
    }

    @Test
    void fourPlayersResolveToOneChampion() {
        Tournament t = newTournament();
        join(t, 4);

        bracket.start(t);
        assertThat(t.getStatus()).isEqualTo("ACTIVE");
        assertThat(matchRepo.findByTournamentIdAndRound(t.getId(), 1)).hasSize(2);

        runToCompletion(t);

        assertThat(t.getStatus()).isEqualTo("COMPLETED");
        assertThat(t.getWinnerId()).isNotNull();
        long eliminated = participantRepo.findByTournamentId(t.getId()).stream()
            .filter(p -> "ELIMINATED".equals(p.getStatus())).count();
        assertThat(eliminated).isEqualTo(3);               // 4 players → 1 champion, 3 out
        assertThat(matchRepo.findByTournamentIdOrderByRoundAscSlotAsc(t.getId())).hasSize(3); // 2 + 1
    }

    @Test
    void oddPlayersGetAByeAndStillResolve() {
        Tournament t = newTournament();
        join(t, 3);

        bracket.start(t);
        List<TournamentMatch> r1 = matchRepo.findByTournamentIdAndRound(t.getId(), 1);
        assertThat(r1).hasSize(2);
        assertThat(r1.stream().filter(m -> "BYE".equals(m.getStatus())).count()).isEqualTo(1);

        runToCompletion(t);

        assertThat(t.getStatus()).isEqualTo("COMPLETED");
        assertThat(t.getWinnerId()).isNotNull();
        assertThat(participantRepo.findByTournamentId(t.getId()).stream()
            .filter(p -> "ELIMINATED".equals(p.getStatus())).count()).isEqualTo(2);
    }

    @Test
    void fewerThanTwoPlayersCancels() {
        Tournament t = newTournament();
        join(t, 1);

        bracket.start(t);

        assertThat(t.getStatus()).isEqualTo("CANCELLED");
        assertThat(matchRepo.findByTournamentIdOrderByRoundAscSlotAsc(t.getId())).isEmpty();
    }
}
