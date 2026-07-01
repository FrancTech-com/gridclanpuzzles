package com.gridclan.service;

import com.gridclan.entity.BattleshipGame;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.repository.BattleshipGameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

    /** Fixed sentinel id for the computer opponent in solo games. */
    public static final UUID COMPUTER_ID = new UUID(0L, 0L);

    private final BattleshipGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService   pointsService;
    private final GemService            gemService;
    private final RankService           rankService;
    private final BattleshipAi          ai;
    private final LevelService          levelService;

    @Value("${gridclan.gems.revive-cost:20}")
    private long reviveCostGems;

    /** Ship cells restored to the human's fleet on a revive. */
    private static final int REVIVE_SHIP_CELLS = 4;

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

    /** Start a solo game vs the computer — both fleets placed, ACTIVE at once, you
     *  fire first. Free hints are granted by rank (Beginner 5 / Amateur 3 / Pro 0).
     *  Optional difficulty/level set the AI strength + points and gate the ladder. */
    @Transactional
    public Map<String, Object> createSolo(UUID userId, Difficulty difficulty, int level) {
        if (difficulty != null) {
            levelService.requireUnlocked(userId, "BATTLESHIP", difficulty, level);
        }
        BattleshipGame g = BattleshipGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .player2Id(COMPUTER_ID)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board1(serialize(placeFleet()))
            .board2(serialize(placeFleet()))
            .vsComputer(true)
            .hintsRemaining(rankService.soloHints(userId))
            .difficulty(difficulty != null ? difficulty.name() : null)
            .level(difficulty != null ? level : 0)
            .build();
        repo.save(g);
        log.info("Battleship solo game created: creator={} diff={} level={} hints={}",
            userId, difficulty, level, g.getHintsRemaining());
        return view(userId, g, null);
    }

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a fully-initialized, pre-paired ACTIVE game for a bracket match. */
    @Transactional
    public UUID createMatch(UUID p1, UUID p2) {
        BattleshipGame g = BattleshipGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(p1).player2Id(p2)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board1(serialize(placeFleet()))
            .board2(serialize(placeFleet()))
            .build();
        repo.save(g);
        return g.getId();
    }

    /** True once the backing game has finished. */
    @Transactional(readOnly = true)
    public boolean isMatchComplete(UUID gameId) {
        return repo.findById(gameId).map(g -> "COMPLETE".equals(g.getStatus())).orElse(false);
    }

    /** Winner of a finished game (battleship has no draws); falls back to player1. */
    @Transactional(readOnly = true)
    public UUID matchWinner(UUID gameId) {
        return repo.findById(gameId)
            .map(g -> g.getWinnerId() != null ? g.getWinnerId() : g.getPlayer1Id())
            .orElse(null);
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
            awardWin(g, userId, me);
            result = "WIN";
        } else {
            g.setCurrentPlayer((short) (me == 1 ? 2 : 1));   // one shot per turn, then switch
            // Solo game: the computer takes its shot immediately, so the human's
            // view already reflects it (their own board shows the AI's hit/miss).
            if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) {
                aiFire(g);
            }
        }

        repo.save(g);
        broadcast(g);
        return view(userId, g, result);
    }

    /** Credit a human winner: native points (+ afloat bonus) + rank-scaled gems. */
    private void awardWin(BattleshipGame g, UUID winnerId, int me) {
        g.setStatus("COMPLETE");
        g.setWinnerId(winnerId);
        int afloat = countAfloat(parse(me == 1 ? g.getBoard1() : g.getBoard2()));
        int award  = WIN_POINTS + afloat * AFLOAT_CELL_BONUS;
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        if (d != null) award = (int) Math.round(award * d.pointsMultiplierFor(g.getLevel()));
        pointsService.creditGamePoints(winnerId, "BATTLESHIP", award, "GAME_WIN", g.getId());
        gemService.creditGems(winnerId, rankService.gemsPerWin(winnerId), "GAME_REWARD", g.getId());
        if (d != null) levelService.recordCompletion(winnerId, "BATTLESHIP", d, g.getLevel(), award);
    }

    /**
     * Forfeit (resign): the current player concedes, handing the win to their
     * opponent. Allowed any time the game is live. The opponent banks the base
     * win points (no afloat bonus on a concession) plus the rank-scaled gems of
     * a normal win. Solo games end with the computer "winning" and earning nothing.
     */
    @Transactional
    public Map<String, Object> forfeit(UUID userId, UUID gameId) {
        BattleshipGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        int me = turnOf(g, userId);   // validates the caller is a player
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.getPlayer2Id() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No opponent to forfeit to yet.");

        UUID opponentId = me == 1 ? g.getPlayer2Id() : g.getPlayer1Id();
        g.setStatus("COMPLETE");
        g.setWinnerId(opponentId);
        g.setLastMoveAt(Instant.now());
        if (!COMPUTER_ID.equals(opponentId)) {
            pointsService.creditGamePoints(opponentId, "BATTLESHIP", WIN_POINTS, "GAME_FORFEIT", g.getId());
            gemService.creditGems(opponentId, rankService.gemsPerWin(opponentId), "GAME_REWARD", g.getId());
        }
        repo.save(g);
        broadcast(g);
        log.info("Battleship forfeit: game={} forfeiter={} winner={}", g.getId(), userId, opponentId);
        return view(userId, g, null);
    }

    /** The computer (player 2) fires one shot at the human's board (board1). On a
     *  ladder game its accuracy follows the difficulty/level (easier = more random). */
    private void aiFire(BattleshipGame g) {
        char[][] board = parse(g.getBoard1());
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        double blunder = d != null ? d.aiBlunderChance(g.getLevel()) : 0.0;
        int[] t = ai.nextTarget(board, blunder);
        int r = t[0], c = t[1];
        board[r][c] = board[r][c] == 'S' ? 'X' : 'O';
        g.setBoard1(serialize(board));
        g.setLastMoveAt(Instant.now());

        if (noShipsLeft(board)) {
            g.setStatus("COMPLETE");
            g.setWinnerId(COMPUTER_ID);
        } else {
            g.setCurrentPlayer((short) 1);     // back to the human
        }
    }

    // ── Revive (solo only; spend gems to undo a loss and play on) ─────────────

    /**
     * After losing a solo game (your fleet sunk), spend gems to revive: restore a
     * few of your hit ship cells so you have a fighting fleet again, and take the
     * turn back. Insufficient gems throws (the app offers to buy).
     */
    @Transactional
    public Map<String, Object> revive(UUID userId, UUID gameId) {
        BattleshipGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!g.isVsComputer() || !userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Revive is only for solo games.");
        if (!"COMPLETE".equals(g.getStatus()) || !COMPUTER_ID.equals(g.getWinnerId()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Nothing to revive.");

        gemService.spendGems(userId, reviveCostGems, "REVIVE", g.getId());

        char[][] board = parse(g.getBoard1());
        restoreFleet(board);                     // revert some hits back to ship
        g.setBoard1(serialize(board));
        g.setStatus("ACTIVE");
        g.setWinnerId(null);
        g.setCurrentPlayer((short) 1);           // your turn to fire
        g.setLastMoveAt(Instant.now());
        repo.save(g);
        broadcast(g);
        log.info("Battleship revive: game={} user={}", g.getId(), userId);
        return view(userId, g, null);
    }

    /** Revert up to REVIVE_SHIP_CELLS of the human's sunk ('X') cells back to ship. */
    private static void restoreFleet(char[][] board) {
        int restored = 0;
        for (int r = 0; r < board.length && restored < REVIVE_SHIP_CELLS; r++) {
            for (int c = 0; c < board[r].length && restored < REVIVE_SHIP_CELLS; c++) {
                if (board[r][c] == 'X') { board[r][c] = 'S'; restored++; }
            }
        }
    }

    // ── Hint (solo only; free, limited by rank) — reveals an enemy ship cell ──

    @Transactional
    public Map<String, Object> hint(UUID userId, UUID gameId) {
        BattleshipGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!g.isVsComputer() || !userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Hints are only for solo games.");
        if (!"ACTIVE".equals(g.getStatus()) || g.getCurrentPlayer() != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Wait for your turn.");
        if (g.getHintsRemaining() <= 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No hints left for this game.");

        // Point the player at an unhit enemy ship cell on board2 — a guaranteed hit.
        char[][] enemy = parse(g.getBoard2());
        List<int[]> ships = new ArrayList<>();
        for (int r = 0; r < SIZE; r++)
            for (int c = 0; c < SIZE; c++)
                if (enemy[r][c] == 'S') ships.add(new int[]{ r, c });
        if (ships.isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No hint available.");

        int[] cell = ships.get(RANDOM.nextInt(ships.size()));
        g.setHintsRemaining(g.getHintsRemaining() - 1);
        repo.save(g);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("row",            cell[0]);
        out.put("col",            cell[1]);
        out.put("hintsRemaining", g.getHintsRemaining());
        return out;
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
        out.put("vsComputer",    g.isVsComputer());
        out.put("hintsRemaining", g.getHintsRemaining());
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
