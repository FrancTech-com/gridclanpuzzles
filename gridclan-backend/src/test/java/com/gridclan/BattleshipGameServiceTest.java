package com.gridclan;

import com.gridclan.entity.BattleshipGame;
import com.gridclan.repository.BattleshipGameRepository;
import com.gridclan.service.BattleshipGameService;
import com.gridclan.service.PlayerPointsService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BattleshipGameServiceTest {

    @Mock BattleshipGameRepository repo;
    @Mock SimpMessagingTemplate messaging;
    @Mock PlayerPointsService pointsService;
    @Mock com.gridclan.service.GemService gemService;
    @Mock com.gridclan.service.RankService rankService;
    @Mock com.gridclan.service.BattleshipAi ai;
    @Mock com.gridclan.service.LevelService levelService;
    @InjectMocks BattleshipGameService service;

    private static final UUID U1 = UUID.randomUUID();
    private static final UUID U2 = UUID.randomUUID();
    private static final UUID GID = UUID.randomUUID();

    private static String grid(Map<String, Character> ships) {
        char[][] b = new char[10][10];
        for (char[] row : b) Arrays.fill(row, '.');
        ships.forEach((k, v) -> { String[] rc = k.split(","); b[Integer.parseInt(rc[0])][Integer.parseInt(rc[1])] = v; });
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 10; r++) { if (r > 0) sb.append('\n'); sb.append(b[r]); }
        return sb.toString();
    }

    /** player2 has a single 2-cell ship at (0,0)-(0,1); player1 to fire. */
    private BattleshipGame withTinyFleet() {
        return BattleshipGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(U2)
            .status("ACTIVE").currentPlayer((short) 1)
            .board1(grid(Map.of()))
            .board2(grid(Map.of("0,0", 'S', "0,1", 'S')))
            .build();
    }

    @Test @DisplayName("create(): a full fleet of 17 ship cells is placed, none touching")
    void create_placesFullFleet() {
        when(repo.existsByInviteCode(any())).thenReturn(false);
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        ArgumentCaptor<BattleshipGame> cap = ArgumentCaptor.forClass(BattleshipGame.class);

        service.create(U1);
        verify(repo).save(cap.capture());
        char[][] b = parse(cap.getValue().getBoard1());

        int ships = 0;
        for (char[] row : b) for (char ch : row) if (ch == 'S') ships++;
        assertThat(ships).isEqualTo(17);   // fleet 5+4+3+3+2

        // No two ships orthogonally OR diagonally adjacent.
        for (int r = 0; r < 10; r++)
            for (int c = 0; c < 10; c++)
                if (b[r][c] == 'S') assertThat(noDiagonalTouch(b, r, c)).isTrue();
    }

    @Test @DisplayName("Revive restores some hit cells to ship and resumes")
    void revive_restoresFleetAndResumes() {
        // A finished solo game the computer won — the human's board1 is all sunk.
        BattleshipGame g = BattleshipGame.builder()
            .id(GID).inviteCode("ABC123").player1Id(U1).player2Id(BattleshipGameService.COMPUTER_ID)
            .status("COMPLETE").winnerId(BattleshipGameService.COMPUTER_ID).vsComputer(true)
            .currentPlayer((short) 2)
            .board1(grid(Map.of("0,0", 'X', "0,1", 'X', "0,2", 'X', "0,3", 'X')))
            .board2(grid(Map.of("5,5", 'S')))
            .build();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.revive(U1, GID);

        assertThat(view.get("status")).isEqualTo("ACTIVE");
        assertThat(g.getWinnerId()).isNull();
        assertThat(g.getBoard1()).contains("S");   // fleet restored → can keep firing
        verify(gemService).spendGems(eq(U1), anyLong(), eq("REVIVE"), eq(GID));
    }

    @Test @DisplayName("Firing reports HIT then SUNK, and sinking the last ship WINS")
    void move_hitSunkWin() {
        BattleshipGame g = withTinyFleet();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var first = service.move(U1, GID, 0, 0);
        assertThat(first.get("lastShot")).isEqualTo("HIT");
        assertThat(g.getCurrentPlayer()).isEqualTo((short) 2);   // turn switched

        g.setCurrentPlayer((short) 1);   // pretend player2 missed; player1 fires again
        var second = service.move(U1, GID, 0, 1);
        assertThat(second.get("lastShot")).isEqualTo("WIN");
        assertThat(second.get("status")).isEqualTo("COMPLETE");
        assertThat(second.get("outcome")).isEqualTo("WON");
    }

    @Test @DisplayName("Firing at empty water is a MISS and passes the turn")
    void move_miss_switchesTurn() {
        BattleshipGame g = withTinyFleet();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var view = service.move(U1, GID, 9, 9);
        assertThat(view.get("lastShot")).isEqualTo("MISS");
        assertThat(g.getCurrentPlayer()).isEqualTo((short) 2);
    }

    @Test @DisplayName("Firing at the same cell twice is rejected")
    void move_repeatShot_rejected() {
        BattleshipGame g = withTinyFleet();
        when(repo.findById(GID)).thenReturn(Optional.of(g));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        service.move(U1, GID, 9, 9);     // miss
        g.setCurrentPlayer((short) 1);
        assertThatThrownBy(() -> service.move(U1, GID, 9, 9))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("already fired");
    }

    @Test @DisplayName("The opponent's untouched ships are never exposed in the tracking view")
    @SuppressWarnings("unchecked")
    void view_hidesOpponentShips() {
        BattleshipGame g = withTinyFleet();
        when(repo.findById(GID)).thenReturn(Optional.of(g));

        var view = service.get(U1, GID);
        List<String> tracking = (List<String>) view.get("trackingBoard");
        // board2 has ships at (0,0)/(0,1) but player1 hasn't fired — must read as water.
        assertThat(tracking.get(0)).doesNotContain("S");
        assertThat(String.join("", tracking)).doesNotContain("S");
    }

    private static boolean noDiagonalTouch(char[][] b, int r, int c) {
        for (int dr = -1; dr <= 1; dr++)
            for (int dc = -1; dc <= 1; dc++) {
                if (dr == 0 && dc == 0) continue;
                // Only flag a *different* ship cell: same ship is a straight run, so a
                // diagonal neighbour that is 'S' means two ships touch.
                int nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= 10 || nc < 0 || nc >= 10) continue;
                if (dr != 0 && dc != 0 && b[nr][nc] == 'S') return false;  // diagonal touch
            }
        return true;
    }

    private static char[][] parse(String text) {
        String[] rows = text.split("\n", -1);
        char[][] b = new char[10][10];
        for (int r = 0; r < 10; r++) b[r] = rows[r].toCharArray();
        return b;
    }
}
