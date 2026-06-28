package com.gridclan.service;

import com.gridclan.entity.GomokuGame;
import com.gridclan.repository.GomokuGameRepository;
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
 * Gomoku (five-in-a-row) — real-time, shared-board, turn-based 2-player games.
 * Server-authoritative: the board lives here; the client only proposes a stone
 * placement, which is validated against the real board and the current turn.
 * Every change is pushed to /topic/gomoku/{id} so the opponent updates live.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GomokuGameService {

    static final int SIZE     = 15;
    static final int WIN_RUN  = 5;
    // Native scoring: a win is worth a base award plus a speed bonus that decays
    // with the number of stones played — a quick, decisive win scores highest.
    static final int WIN_POINTS = 100;
    static final int SPEED_BONUS_MAX = 50;
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final SecureRandom RANDOM   = new SecureRandom();

    private final GomokuGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService   pointsService;

    // ── Create / join ──────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> create(UUID userId) {
        GomokuGame g = GomokuGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .status("WAITING_FOR_OPPONENT")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .build();
        repo.save(g);
        log.info("Gomoku game created: code={} creator={}", g.getInviteCode(), userId);
        return view(userId, g);
    }

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a fully-initialized, pre-paired ACTIVE game for a bracket match. */
    @Transactional
    public UUID createMatch(UUID p1, UUID p2) {
        GomokuGame g = GomokuGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(p1).player2Id(p2)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .build();
        repo.save(g);
        return g.getId();
    }

    /** True once the backing game has finished. */
    @Transactional(readOnly = true)
    public boolean isMatchComplete(UUID gameId) {
        return repo.findById(gameId).map(g -> "COMPLETE".equals(g.getStatus())).orElse(false);
    }

    /** Winner of a finished game; a draw is broken deterministically to player1. */
    @Transactional(readOnly = true)
    public UUID matchWinner(UUID gameId) {
        return repo.findById(gameId)
            .map(g -> g.getWinnerId() != null ? g.getWinnerId() : g.getPlayer1Id())
            .orElse(null);
    }

    @Transactional
    public Map<String, Object> join(UUID userId, String code) {
        GomokuGame g = byCode(code);
        if (userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You created this game — share the code.");
        if (g.getPlayer2Id() != null && !g.getPlayer2Id().equals(userId))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is already full.");

        if (g.getPlayer2Id() == null) {
            g.setPlayer2Id(userId);
            g.setStatus("ACTIVE");
            repo.save(g);
            log.info("Gomoku game joined: code={} opponent={}", code, userId);
            broadcast(g);   // player1 moves first
        }
        return view(userId, g);
    }

    // ── Turn ───────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> move(UUID userId, UUID gameId, int row, int col) {
        GomokuGame g = active(gameId, userId);
        int me = turnOf(g, userId);

        if (row < 0 || row >= SIZE || col < 0 || col >= SIZE)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Off the board.");
        char[][] board = parse(g.getBoard());
        if (board[row][col] != '.')
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That spot is taken.");

        char stone = me == 1 ? '1' : '2';
        board[row][col] = stone;
        g.setBoard(serialize(board));
        g.setLastMoveAt(Instant.now());

        if (isWin(board, row, col, stone)) {
            g.setStatus("COMPLETE");
            g.setWinnerId(userId);
            // Win + speed bonus (fewer total stones = faster, decisive win).
            int stones = countStones(board);
            int award  = WIN_POINTS + Math.max(0, SPEED_BONUS_MAX - stones);
            pointsService.creditGamePoints(userId, "GOMOKU", award, "GAME_WIN", g.getId());
        } else if (isFull(board)) {
            g.setStatus("COMPLETE");
            g.setWinnerId(null);            // draw
        } else {
            g.setCurrentPlayer((short) (me == 1 ? 2 : 1));
        }

        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(UUID userId, UUID gameId) {
        return view(userId, repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found.")));
    }

    // ── View ─────────────────────────────────────────────────────────────────

    private Map<String, Object> view(UUID userId, GomokuGame g) {
        int me = userId.equals(g.getPlayer1Id()) ? 1 : userId.equals(g.getPlayer2Id()) ? 2 : 0;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",      g.getId());
        out.put("inviteCode",  g.getInviteCode());
        out.put("status",      g.getStatus());
        out.put("board",       Arrays.asList(g.getBoard().split("\n", -1)));
        out.put("yourStone",   me);     // 1 or 2 (0 = spectator)
        out.put("yourTurn",    me != 0 && me == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus()));
        out.put("hasOpponent", g.getPlayer2Id() != null);
        if ("COMPLETE".equals(g.getStatus())) {
            out.put("outcome", g.getWinnerId() == null ? "TIE"
                : g.getWinnerId().equals(userId) ? "WON" : "LOST");
        }
        return out;
    }

    /** Lightweight "state changed" ping; clients re-fetch their own view. */
    private void broadcast(GomokuGame g) {
        try {
            messaging.convertAndSend("/topic/gomoku/" + g.getId(), Map.of(
                "gameId",        g.getId().toString(),
                "status",        g.getStatus(),
                "currentPlayer", g.getCurrentPlayer(),
                "version",       g.getLastMoveAt().toEpochMilli()
            ));
        } catch (Exception ignored) { /* live updates are never fatal */ }
    }

    // ── Win detection ──────────────────────────────────────────────────────

    /** Five-in-a-row through the just-placed stone, in any of the 4 axes. */
    static boolean isWin(char[][] b, int row, int col, char stone) {
        int[][] axes = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };
        for (int[] d : axes) {
            int run = 1
                + count(b, row, col, d[0], d[1], stone)
                + count(b, row, col, -d[0], -d[1], stone);
            if (run >= WIN_RUN) return true;
        }
        return false;
    }

    private static int count(char[][] b, int row, int col, int dr, int dc, char stone) {
        int n = 0, r = row + dr, c = col + dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] == stone) {
            n++; r += dr; c += dc;
        }
        return n;
    }

    private static boolean isFull(char[][] b) {
        for (char[] row : b) for (char ch : row) if (ch == '.') return false;
        return true;
    }

    /** Total stones placed by both players — used for the speed bonus. */
    private static int countStones(char[][] b) {
        int n = 0;
        for (char[] row : b) for (char ch : row) if (ch != '.') n++;
        return n;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private GomokuGame byCode(String code) {
        return repo.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
    }

    private GomokuGame active(UUID gameId, UUID userId) {
        GomokuGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (turnOf(g, userId) != g.getCurrentPlayer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It's not your turn.");
        return g;
    }

    private int turnOf(GomokuGame g, UUID userId) {
        if (userId.equals(g.getPlayer1Id())) return 1;
        if (userId.equals(g.getPlayer2Id())) return 2;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
    }

    private static String emptyBoard() {
        String row = ".".repeat(SIZE);
        return String.join("\n", Collections.nCopies(SIZE, row));
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
