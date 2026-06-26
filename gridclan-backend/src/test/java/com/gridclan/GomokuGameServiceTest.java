package com.gridclan;

import com.gridclan.entity.GomokuGame;
import com.gridclan.repository.GomokuGameRepository;
import com.gridclan.service.GomokuGameService;
import com.gridclan.service.PlayerPointsService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GomokuGameServiceTest {

    @Mock GomokuGameRepository repo;
    @Mock SimpMessagingTemplate messaging;
    @Mock PlayerPointsService pointsService;
    @InjectMocks GomokuGameService service;

    private static final UUID U1 = UUID.randomUUID();
    private static final UUID U2 = UUID.randomUUID();
    private static final UUID GID = UUID.randomUUID();

    /** A 15×15 board with player1 ('1') at row 0, cols 0..3 — one move from five. */
    private GomokuGame nearWin() {
        char[][] b = new char[15][15];
        for (char[] row : b) Arrays.fill(row, '.');
        for (int c = 0; c < 4; c++) b[0][c] = '1';
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 15; r++) { if (r > 0) sb.append('\n'); sb.append(b[r]); }
        return GomokuGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(U2)
            .status("ACTIVE").currentPlayer((short) 1).board(sb.toString()).build();
    }

    @Test @DisplayName("Completing five-in-a-row wins the game")
    void move_fiveInARow_wins() {
        GomokuGame g = nearWin();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.move(U1, GID, 0, 4);   // fifth stone

        assertThat(view.get("status")).isEqualTo("COMPLETE");
        assertThat(view.get("outcome")).isEqualTo("WON");
        assertThat(g.getWinnerId()).isEqualTo(U1);
    }

    @Test @DisplayName("Playing out of turn is rejected")
    void move_outOfTurn_rejected() {
        GomokuGame g = nearWin();   // currentPlayer = 1
        when(repo.findById(GID)).thenReturn(Optional.of(g));

        assertThatThrownBy(() -> service.move(U2, GID, 5, 5))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("not your turn");
    }

    @Test @DisplayName("Playing on an occupied cell is rejected")
    void move_occupiedCell_rejected() {
        GomokuGame g = nearWin();
        when(repo.findById(GID)).thenReturn(Optional.of(g));

        assertThatThrownBy(() -> service.move(U1, GID, 0, 0))   // already '1'
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("taken");
    }

    @Test @DisplayName("A non-winning move passes the turn to the opponent")
    void move_noWin_switchesTurn() {
        char[][] b = new char[15][15];
        for (char[] row : b) Arrays.fill(row, '.');
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 15; r++) { if (r > 0) sb.append('\n'); sb.append(b[r]); }
        GomokuGame g = GomokuGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(U2)
            .status("ACTIVE").currentPlayer((short) 1).board(sb.toString()).build();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.move(U1, GID, 7, 7);

        assertThat(view.get("status")).isEqualTo("ACTIVE");
        assertThat(g.getCurrentPlayer()).isEqualTo((short) 2);
    }
}
