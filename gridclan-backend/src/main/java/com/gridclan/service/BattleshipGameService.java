package com.gridclan.service;

import com.gridclan.entity.BattleshipGame;
import com.gridclan.repository.BattleshipGameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

/**
 * Battleship — real-time 2-player games. Each player gets a 10×10 grid with a
 * randomly-placed fleet (server-side). Players alternate firing at the opponent's
 * grid; a player's own ship positions are NEVER revealed to the opponent — the
 * tracking view only exposes the cells that player has already fired at. First to
 * sink the whole enemy fleet wins. Every change is pushed to /topic/battleship/{id}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BattleshipGameService {

    static final int   SIZE  = 10;
    static final int[] FLEET = { 5, 4, 3, 3, 2 };   // carrier, battleship, cruiser, submarine, destroyer
    // Native scoring: a win plus a bonus per own ship-cell still afloat — winning
    // with your fleet mostly intact (a dominant game) scores highest.
    static final int WIN_POINTS        = 100;
    static final int AFLOAT_CELL_BONUS = 5;
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final SecureRandom RANDOM   = new SecureRandom();

    private final BattleshipGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService   pointsService;

    // ── Create / join ──────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> create(UUID userId) {
        BattleshipGame g = BattleshipGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .status("WAITING_FOR_OPPONENT")
            .currentPlayer((short) 1)
            .board1(serialize(placeFleet()))
            .build();
        repo.save(g);
        log.info("Battleship game created: code={} creator={}", g.getInviteCode(), userId);
        return view(userId, g, null);
    }

    @Transactional
    public Map<String, Object> join(UUID userId, String code) {
        BattleshipGame g = byCode(code);
        if (userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You created this game — share the code.");
        if (g.getPlayer2Id() != null && !g.getPlayer2Id().equals(userId))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is already full.");

        if (g.getPlayer2Id() == null) {
            g.setPlayer2Id(userId);
            g.setBoard2(serialize(placeFleet()));
            g.setStatus("ACTIVE");
            repo.save(g);
            log.info("Battleship game joined: code={} opponent={}", code, userId);
            broadcast(g);   // player1 fires first
        }
        return view(userId, g, null);
    }

    // ── Turn ───────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> move(UUID userId, UUID gameId, int row, int col) {
        BattleshipGame g = active(gameId, userId);
        int me = turnOf(g, userId);

        if (row < 0 || row >= SIZE || col < 0 || col >= SIZE)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Off the grid.");

        // I fire at the opponent's home board.
        char[][] target = parse(me == 1 ? g.getBoard2() : g.getBoard1());
        char cell = target[row][col];
        if (cell == 'X' || cell == 'O')
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "You've already fired there.");

        String result;
        if (cell == 'S') {
            target[row][col] = 'X';
            result = shipSunk(target, row, col) ? "SUNK" : "HIT";
        } else {
            target[row][col] = 'O';
            result = "MISS";
        }

        if (me == 1) g.setBoard2(serialize(target)); else g.setBoard1(serialize(target));
        g.setLastMoveAt(Instant.now());

        if (noShipsLeft(target)) {
            g.setStatus("COMPLETE");
            g.setWinnerId(userId);
            result = "WIN";
            // Win + bonus for every own ship-cell still afloat ('S' on my board).
            int afloat = countAfloat(parse(me == 1 ? g.getBoard1() : g.getBoard2()));
            int award  = WIN_POINTS + afloat * AFLOAT_CELL_BONUS;
            pointsService.creditGamePoints(userId, "BATTLESHIP", award, "GAME_WIN", g.getId());
        } else {
            g.setCurrentPlayer((short) (me == 1 ? 2 : 1));   // one shot per turn, then switch
        }

        repo.save(g);
        broadcast(g);
        return view(userId, g, result);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(UUID userId, UUID gameId) {
        return view(userId, repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found.")), null);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    /**
     * yourBoard  = your own waters (your ships + the opponent's hits/misses).
     * trackingBoard = the opponent's waters MASKED to only your shots ('X'/'O');
     *                 their untouched ships and water both show as '.'.
     */
    private Map<String, Object> view(UUID userId, BattleshipGame g, String lastShot) {
        int me = userId.equals(g.getPlayer1Id()) ? 1 : userId.equals(g.getPlayer2Id()) ? 2 : 0;
        String myBoard  = me == 2 ? g.getBoard2() : g.getBoard1();
        String oppBoard = me == 2 ? g.getBoard1() : g.getBoard2();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",        g.getId());
        out.put("inviteCode",    g.getInviteCode());
        out.put("status",        g.getStatus());
        out.put("yourBoard",     me == 0 ? emptyRows() : Arrays.asList(myBoard.split("\n", -1)));
        out.put("trackingBoard", oppBoard == null ? emptyRows() : mask(oppBoard));
        out.put("yourTurn",      me != 0 && me == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus()));
        out.put("hasOpponent",   g.getPlayer2Id() != null);
        if (lastShot != null) out.put("lastShot", lastShot);
        if ("COMPLETE".equals(g.getStatus())) {
            out.put("outcome", g.getWinnerId() == null ? "TIE"
                : g.getWinnerId().equals(userId) ? "WON" : "LOST");
        }
        return out;
    }

    /** Hide untouched ships: reveal only fired cells ('X'/'O'); everything else is '.'. */
    private static List<String> mask(String board) {
        String[] rows = board.split("\n", -1);
        List<String> out = new ArrayList<>(rows.length);
        for (String row : rows) {
            StringBuilder sb = new StringBuilder(row.length());
            for (char ch : row.toCharArray()) sb.append(ch == 'X' || ch == 'O' ? ch : '.');
            out.add(sb.toString());
        }
        return out;
    }

    private void broadcast(BattleshipGame g) {
        try {
            messaging.convertAndSend("/topic/battleship/" + g.getId(), Map.of(
                "gameId",        g.getId().toString(),
                "status",        g.getStatus(),
                "currentPlayer", g.getCurrentPlayer(),
                "version",       g.getLastMoveAt().toEpochMilli()
            ));
        } catch (Exception ignored) { /* live updates are never fatal */ }
    }

    // ── Rules ──────────────────────────────────────────────────────────────

    private static boolean noShipsLeft(char[][] board) {
        for (char[] row : board) for (char ch : row) if (ch == 'S') return false;
        return true;
    }

    /** Count untouched ('S') ship cells on a board — own ships still afloat. */
    private static int countAfloat(char[][] board) {
        int n = 0;
        for (char[] row : board) for (char ch : row) if (ch == 'S') n++;
        return n;
    }

    /** The ship hit at (r,c) is sunk if its whole connected run of ship cells is now 'X'. */
    private static boolean shipSunk(char[][] board, int r, int c) {
        // Ships don't touch (placement guarantees a clear border), so the 4-connected
        // component of ship cells through (r,c) is exactly one ship.
        Deque<int[]> stack = new ArrayDeque<>();
        boolean[][] seen = new boolean[SIZE][SIZE];
        stack.push(new int[]{ r, c });
        seen[r][c] = true;
        int[][] dirs = { {0, 1}, {0, -1}, {1, 0}, {-1, 0} };
        while (!stack.isEmpty()) {
            int[] cur = stack.pop();
            if (board[cur[0]][cur[1]] == 'S') return false;   // a part is still afloat
            for (int[] d : dirs) {
                int nr = cur[0] + d[0], nc = cur[1] + d[1];
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || seen[nr][nc]) continue;
                if (board[nr][nc] == 'S' || board[nr][nc] == 'X') { seen[nr][nc] = true; stack.push(new int[]{ nr, nc }); }
            }
        }
        return true;
    }

    // ── Fleet placement (no two ships touch, incl. diagonally) ───────────────

    private static char[][] placeFleet() {
        char[][] board = new char[SIZE][SIZE];
        for (char[] row : board) Arrays.fill(row, '.');
        for (int size : FLEET) {
            boolean placed = false;
            for (int attempt = 0; attempt < 500 && !placed; attempt++) {
                boolean horizontal = RANDOM.nextBoolean();
                int r = RANDOM.nextInt(horizontal ? SIZE : SIZE - size + 1);
                int c = RANDOM.nextInt(horizontal ? SIZE - size + 1 : SIZE);
                if (canPlace(board, r, c, size, horizontal)) {
                    for (int i = 0; i < size; i++) board[horizontal ? r : r + i][horizontal ? c + i : c] = 'S';
                    placed = true;
                }
            }
            if (!placed) throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not place fleet.");
        }
        return board;
    }

    private static boolean canPlace(char[][] board, int r, int c, int size, boolean horizontal) {
        for (int i = 0; i < size; i++) {
            int rr = horizontal ? r : r + i;
            int cc = horizontal ? c + i : c;
            // The cell and all 8 neighbours must be clear (no touching ships).
            for (int dr = -1; dr <= 1; dr++) {
                for (int dc = -1; dc <= 1; dc++) {
                    int nr = rr + dr, nc = cc + dc;
                    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                    if (board[nr][nc] == 'S') return false;
                }
            }
        }
        return true;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private static List<String> emptyRows() {
        return new ArrayList<>(Collections.nCopies(SIZE, ".".repeat(SIZE)));
    }

    private BattleshipGame byCode(String code) {
        return repo.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
    }

    private BattleshipGame active(UUID gameId, UUID userId) {
        BattleshipGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (turnOf(g, userId) != g.getCurrentPlayer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It's not your turn.");
        return g;
    }

    private int turnOf(BattleshipGame g, UUID userId) {
        if (userId.equals(g.getPlayer1Id())) return 1;
        if (userId.equals(g.getPlayer2Id())) return 2;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
    }

    private static char[][] parse(String text) {
        String[] rows = text.split("\n", -1);
        char[][] b = new char[SIZE][SIZE];
        for (int r = 0; r < SIZE; r++) b[r] = rows[r].toCharArray();
        return b;
    }

    private static String serialize(char[][] b) {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < SIZE; r++) {
            if (r > 0) sb.append('\n');
            sb.append(b[r]);
        }
        return sb.toString();
    }

    private String uniqueCode() {
        for (int i = 0; i < 10; i++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int j = 0; j < CODE_LENGTH; j++) sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
            String code = sb.toString();
            if (!repo.existsByInviteCode(code)) return code;
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not allocate a code.");
    }
}
