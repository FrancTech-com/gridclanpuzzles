package com.gridclan;

import com.gridclan.entity.ScrabbleGame;
import com.gridclan.repository.ScrabbleGameRepository;
import com.gridclan.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ScrabbleGameServiceTest {

    @Mock ScrabbleGameRepository repo;
    @Mock SimpMessagingTemplate messaging;
    @Mock PlayerPointsService pointsService;
    @Mock GemService gemService;
    @Mock RankService rankService;
    @Mock ScrabbleAi ai;
    @Mock LevelService levelService;
    @Mock com.gridclan.repository.UserRepository userRepo;
    @InjectMocks ScrabbleGameService service;

    private static final UUID U1 = UUID.randomUUID();
    private static final UUID U2 = UUID.randomUUID();
    private static final UUID GID = UUID.randomUUID();

    /** A 2-player ACTIVE head-to-head game with the given bag and pass streak. */
    private ScrabbleGame game(String bag, int passStreak) {
        String row = ".".repeat(15);
        String board = String.join("\n", Collections.nCopies(15, row));
        return ScrabbleGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(U2)
            .maxPlayers((short) 2).status("ACTIVE").currentPlayer((short) 1)
            .board(board).bag(bag).rack1("").rack2("")
            .score1(10).score2(5)
            .passStreak((short) passStreak).lastMoveAt(Instant.now())
            .build();
    }

    @Test @DisplayName("Joining a 3-seat game seats the next player (seat 3) via the locking fetch and starts the game")
    void join_seatsNextPlayer_andStarts() {
        String row = ".".repeat(15);
        String board = String.join("\n", Collections.nCopies(15, row));
        ScrabbleGame g = ScrabbleGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(U2)
            .maxPlayers((short) 3).status("WAITING_FOR_OPPONENT").currentPlayer((short) 1)
            .board(board).bag("ABCDEFGHIJKLMNOPQRST").rack1("").rack2("")
            .build();
        // Only the locking fetch is stubbed — if join() used the unlocked finder it'd 404.
        when(repo.findByInviteCodeForUpdate("ABC123")).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        UUID u3 = UUID.randomUUID();

        var view = service.join(u3, "ABC123");

        assertThat(g.playerId(3)).isEqualTo(u3);          // seated in the empty seat
        assertThat(g.getStatus()).isEqualTo("ACTIVE");    // 3/3 seated → game starts
        assertThat(view.get("seatedCount")).isEqualTo(3);
    }

    @Test @DisplayName("Passing does NOT end the game while the bag still has tiles")
    void pass_withTilesLeft_keepsPlaying() {
        // Streak is already at the threshold (2 per player), but the bag isn't empty.
        ScrabbleGame g = game("ABCDE", 3);
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.pass(U1, GID);

        assertThat(view.get("status")).isEqualTo("ACTIVE");   // game continues
        assertThat(g.getCurrentPlayer()).isEqualTo((short) 2); // turn handed over
    }

    @Test @DisplayName("Once the bag is empty, everyone passing twice ends the game and grants the leader the win")
    void pass_bagEmpty_allPassedOut_ends() {
        // Bag empty; this pass makes the streak reach 2 per player.
        ScrabbleGame g = game("", 3);
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.pass(U1, GID);

        assertThat(view.get("status")).isEqualTo("COMPLETE");
        assertThat(g.getWinnerId()).isEqualTo(U1);   // higher score wins
    }
}
