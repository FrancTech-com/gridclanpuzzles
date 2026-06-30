package com.gridclan.service;

import com.gridclan.entity.ScrabbleGame;
import com.gridclan.gridscrabble.*;
import com.gridclan.repository.ScrabbleGameRepository;
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
 * Grid Scrabble — shared-board, turn-based, async 2-player games.
 * Server-authoritative: the board, bag and racks live here; the client only
 * proposes tile placements, which MoveValidator checks against the real rules
 * and the player's actual rack.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScrabbleGameService {

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final SecureRandom RANDOM  = new SecureRandom();
    // Flat points handed to the opponent when a player forfeits, so a concession
    // is always worth points to them regardless of the word score so far.
    private static final int    FORFEIT_WIN_POINTS = 100;

    /** Fixed sentinel id for the computer opponent in solo games. */
    public static final UUID COMPUTER_ID = new UUID(0L, 0L);

    private final ScrabbleGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService    pointsService;
    private final GemService             gemService;
    private final RankService            rankService;
    private final ScrabbleAi             ai;

    // Dictionary loaded once (≈359k words). Lazy so startup isn't blocked.
    private volatile WordList dict;
    private WordList dict() {
        WordList d = dict;
        if (d == null) synchronized (this) { if ((d = dict) == null) dict = d = WordList.fromResource(); }
        return d;
    }

    // ── Create / join ──────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> create(UUID userId) {
        TileBag bag = new TileBag(RANDOM.nextLong());
        String rack1 = chars(bag.draw(TileBag.RACK_SIZE));
        String bagStr = chars(bag.snapshot());

        ScrabbleGame g = ScrabbleGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .status("WAITING_FOR_OPPONENT")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .bag(bagStr)
            .rack1(rack1)
            .build();
        repo.save(g);
        log.info("Scrabble game created: code={} creator={}", g.getInviteCode(), userId);
        return view(userId, g);
    }

    /** Start a solo game vs the computer — both racks drawn, ACTIVE at once, you
     *  move first. Free hints are granted by rank (Beginner 5 / Amateur 3 / Pro 0). */
    @Transactional
    public Map<String, Object> createSolo(UUID userId) {
        TileBag bag = new TileBag(RANDOM.nextLong());
        String rack1 = chars(bag.draw(TileBag.RACK_SIZE));
        String rack2 = chars(bag.draw(TileBag.RACK_SIZE));
        String bagStr = chars(bag.snapshot());

        ScrabbleGame g = ScrabbleGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .player2Id(COMPUTER_ID)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .bag(bagStr).rack1(rack1).rack2(rack2)
            .vsComputer(true)
            .hintsRemaining(rankService.soloHints(userId))
            .build();
        repo.save(g);
        log.info("Scrabble solo game created: creator={} hints={}", userId, g.getHintsRemaining());
        return view(userId, g);
    }

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a fully-initialized, pre-paired ACTIVE game for a bracket match. */
    @Transactional
    public UUID createMatch(UUID p1, UUID p2) {
        TileBag bag = new TileBag(RANDOM.nextLong());
        String rack1 = chars(bag.draw(TileBag.RACK_SIZE));
        String rack2 = chars(bag.draw(TileBag.RACK_SIZE));
        String bagStr = chars(bag.snapshot());

        ScrabbleGame g = ScrabbleGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(p1).player2Id(p2)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .bag(bagStr).rack1(rack1).rack2(rack2)
            .build();
        repo.save(g);
        return g.getId();
    }

    /** True once the backing game has finished. */
    @Transactional(readOnly = true)
    public boolean isMatchComplete(UUID gameId) {
        return repo.findById(gameId).map(g -> "COMPLETE".equals(g.getStatus())).orElse(false);
    }

    /** Winner of a finished game; a tie is broken deterministically to player1. */
    @Transactional(readOnly = true)
    public UUID matchWinner(UUID gameId) {
        return repo.findById(gameId)
            .map(g -> g.getWinnerId() != null ? g.getWinnerId() : g.getPlayer1Id())
            .orElse(null);
    }

    @Transactional
    public Map<String, Object> join(UUID userId, String code) {
        ScrabbleGame g = byCode(code);
        if (userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You created this game — share the code.");
        if (g.getPlayer2Id() != null && !g.getPlayer2Id().equals(userId))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is already full.");

        if (g.getPlayer2Id() == null) {
            StringBuilder bag = new StringBuilder(g.getBag());
            g.setRack2(drawFromBag(bag, TileBag.RACK_SIZE));
            g.setBag(bag.toString());
            g.setPlayer2Id(userId);
            g.setStatus("ACTIVE");
            repo.save(g);
            log.info("Scrabble game joined: code={} opponent={}", code, userId);
            broadcast(g);   // tell the creator (live) that the game has started — their turn
        }
        return view(userId, g);
    }

    // ── Turns ──────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> move(UUID userId, UUID gameId, List<Placement> placements) {
        ScrabbleGame g = active(gameId, userId);
        int me = turnOf(g, userId);

        // 1. Tiles must come from the player's actual rack.
        String rack = me == 1 ? g.getRack1() : g.getRack2();
        String afterRemoval = removeFromRack(rack, placements);

        // 2. Validate the move against the real board + rules + dictionary.
        ScrabbleBoard board = parseBoard(g.getBoard());
        MoveValidator.Result res = MoveValidator.validate(board, placements, dict());
        if (!res.valid()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, res.reason());

        // 3. Apply: board, score, refill rack, advance turn.
        for (Placement p : placements) board.place(p.row(), p.col(), p.letter(), p.blank());
        g.setBoard(serializeBoard(board));

        StringBuilder bag = new StringBuilder(g.getBag());
        String newRack = afterRemoval + drawFromBag(bag, TileBag.RACK_SIZE - afterRemoval.length());
        g.setBag(bag.toString());
        if (me == 1) { g.setRack1(newRack); g.setScore1(g.getScore1() + res.score()); }
        else         { g.setRack2(newRack); g.setScore2(g.getScore2() + res.score()); }

        g.setPassStreak((short) 0);
        g.setLastMoveAt(Instant.now());

        // 4. Game over when the bag is empty and the mover cleared their rack.
        if (bag.length() == 0 && newRack.isEmpty()) finish(g);
        else {
            g.setCurrentPlayer((short) (me == 1 ? 2 : 1));
            if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        }

        repo.save(g);
        broadcast(g);   // opponent's device updates live (or both see the game complete)
        return view(userId, g);
    }

    /** The computer (player 2) takes its turn: play its best word, else pass. */
    private void aiPlay(ScrabbleGame g) {
        ScrabbleBoard board = parseBoard(g.getBoard());
        List<Placement> best = ai.bestMove(board, g.getRack2(), dict());

        if (best == null || best.isEmpty()) {
            // No legal move found — the computer passes.
            g.setPassStreak((short) (g.getPassStreak() + 1));
            if (g.getPassStreak() >= 4) finish(g);
            else g.setCurrentPlayer((short) 1);
            return;
        }

        MoveValidator.Result res = MoveValidator.validate(board, best, dict());
        if (!res.valid()) {   // defensive — should never happen
            g.setPassStreak((short) (g.getPassStreak() + 1));
            g.setCurrentPlayer((short) 1);
            return;
        }

        String afterRemoval = removeFromRack(g.getRack2(), best);
        for (Placement p : best) board.place(p.row(), p.col(), p.letter(), p.blank());
        g.setBoard(serializeBoard(board));

        StringBuilder bag = new StringBuilder(g.getBag());
        String newRack = afterRemoval + drawFromBag(bag, TileBag.RACK_SIZE - afterRemoval.length());
        g.setBag(bag.toString());
        g.setRack2(newRack);
        g.setScore2(g.getScore2() + res.score());
        g.setPassStreak((short) 0);
        g.setLastMoveAt(Instant.now());

        if (bag.length() == 0 && newRack.isEmpty()) finish(g);
        else g.setCurrentPlayer((short) 1);   // back to the human
    }

    // ── Hint (solo only; free, limited by rank) — suggests the best word ──────

    @Transactional
    public Map<String, Object> hint(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!g.isVsComputer() || !userId.equals(g.getPlayer1Id()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Hints are only for solo games.");
        if (!"ACTIVE".equals(g.getStatus()) || g.getCurrentPlayer() != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Wait for your turn.");
        if (g.getHintsRemaining() <= 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No hints left for this game.");

        ScrabbleBoard board = parseBoard(g.getBoard());
        List<Placement> best = ai.bestMove(board, g.getRack1(), dict());
        if (best == null || best.isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "No strong word found — try exchanging tiles or passing.");

        MoveValidator.Result res = MoveValidator.validate(board, best, dict());
        g.setHintsRemaining(g.getHintsRemaining() - 1);
        repo.save(g);

        List<Map<String, Object>> cells = new ArrayList<>();
        for (Placement p : best) {
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("row",    p.row());
            cell.put("col",    p.col());
            cell.put("letter", String.valueOf(p.upper()));
            cell.put("blank",  p.blank());
            cells.add(cell);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("placements",     cells);
        out.put("word",           res.words().isEmpty() ? "" : res.words().get(0));
        out.put("score",          res.score());
        out.put("hintsRemaining", g.getHintsRemaining());
        return out;
    }

    @Transactional
    public Map<String, Object> pass(UUID userId, UUID gameId) {
        ScrabbleGame g = active(gameId, userId);
        int me = turnOf(g, userId);
        g.setPassStreak((short) (g.getPassStreak() + 1));
        g.setLastMoveAt(Instant.now());
        if (g.getPassStreak() >= 4) finish(g);          // both players passed twice
        else {
            g.setCurrentPlayer((short) (me == 1 ? 2 : 1));
            if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        }
        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    @Transactional
    public Map<String, Object> exchange(UUID userId, UUID gameId, String tiles) {
        ScrabbleGame g = active(gameId, userId);
        int me = turnOf(g, userId);
        StringBuilder bag = new StringBuilder(g.getBag());
        if (bag.length() < TileBag.RACK_SIZE)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Not enough tiles left to exchange.");

        String rack = me == 1 ? g.getRack1() : g.getRack2();
        String kept = removeChars(rack, tiles);          // validates the tiles are in the rack
        String drawn = drawFromBag(bag, tiles.length());
        bag.append(tiles);                                // return exchanged tiles
        shuffle(bag);
        g.setBag(bag.toString());
        String newRack = kept + drawn;
        if (me == 1) g.setRack1(newRack); else g.setRack2(newRack);

        g.setPassStreak((short) 0);
        g.setCurrentPlayer((short) (me == 1 ? 2 : 1));
        g.setLastMoveAt(Instant.now());
        if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    /**
     * Forfeit (resign): the current player concedes, handing the win to their
     * opponent. Both players still bank the word points they legitimately earned
     * this game, and the opponent additionally gets a flat forfeit award plus the
     * rank-scaled gems of a normal win. Solo games end with the computer
     * "winning" and earning nothing.
     */
    @Transactional
    public Map<String, Object> forfeit(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
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

        // Each player banks the word points they earned this game (as on a normal finish).
        pointsService.creditGamePoints(g.getPlayer1Id(), "SCRABBLE", g.getScore1(), "GAME_WIN", g.getId());
        if (g.getPlayer2Id() != null && !g.getPlayer2Id().equals(COMPUTER_ID))
            pointsService.creditGamePoints(g.getPlayer2Id(), "SCRABBLE", g.getScore2(), "GAME_WIN", g.getId());

        // Flat forfeit award + rank-scaled gems to a human opponent, so a concession
        // is always worth a clear win reward to them.
        if (!COMPUTER_ID.equals(opponentId)) {
            pointsService.creditGamePoints(opponentId, "SCRABBLE", FORFEIT_WIN_POINTS, "GAME_FORFEIT", g.getId());
            gemService.creditGems(opponentId, rankService.gemsPerWin(opponentId), "GAME_REWARD", g.getId());
        }

        repo.save(g);
        broadcast(g);
        log.info("Scrabble forfeit: game={} forfeiter={} winner={}", g.getId(), userId, opponentId);
        return view(userId, g);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(UUID userId, UUID gameId) {
        return view(userId, repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found.")));
    }

    // ── View (hides the opponent's rack) ─────────────────────────────────────

    private Map<String, Object> view(UUID userId, ScrabbleGame g) {
        int me = userId.equals(g.getPlayer1Id()) ? 1 : userId.equals(g.getPlayer2Id()) ? 2 : 0;
        String yourRack = me == 1 ? g.getRack1() : me == 2 ? g.getRack2() : "";
        int yourScore   = me == 2 ? g.getScore2() : g.getScore1();
        int oppScore    = me == 2 ? g.getScore1() : g.getScore2();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",       g.getId());
        out.put("inviteCode",   g.getInviteCode());
        out.put("status",       g.getStatus());
        out.put("board",        Arrays.asList(g.getBoard().split("\n", -1)));
        out.put("yourRack",     yourRack);
        out.put("yourTurn",     me != 0 && me == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus()));
        out.put("yourScore",    yourScore);
        out.put("opponentScore", oppScore);
        out.put("hasOpponent",  g.getPlayer2Id() != null);
        out.put("tilesInBag",   g.getBag().length());
        out.put("vsComputer",   g.isVsComputer());
        out.put("hintsRemaining", g.getHintsRemaining());
        if ("COMPLETE".equals(g.getStatus())) {
            out.put("outcome", g.getWinnerId() == null ? "TIE"
                : g.getWinnerId().equals(userId) ? "WON" : "LOST");
        }
        return out;
    }

    /**
     * Push a lightweight "state changed" ping to both players over WebSocket so their clients
     * re-fetch their own (rack-filtered) view. Carries no secret state — just enough to know
     * something changed and whose turn it is. Never fatal: a dropped ping just means the other
     * client refreshes on its next focus/poll.
     */
    private void broadcast(ScrabbleGame g) {
        try {
            messaging.convertAndSend("/topic/scrabble/" + g.getId(), Map.of(
                "gameId",        g.getId().toString(),
                "status",        g.getStatus(),
                "currentPlayer", g.getCurrentPlayer(),
                "version",       g.getLastMoveAt().toEpochMilli()
            ));
        } catch (Exception ignored) { /* live updates are never fatal */ }
    }

    private void finish(ScrabbleGame g) {
        g.setStatus("COMPLETE");
        if (g.getScore1() > g.getScore2())      g.setWinnerId(g.getPlayer1Id());
        else if (g.getScore2() > g.getScore1()) g.setWinnerId(g.getPlayer2Id());
        else g.setWinnerId(null); // tie

        // Native scoring: each player banks the word points they earned this game
        // (creditGamePoints no-ops on a 0 score). Feeds the SCRABBLE leaderboard.
        pointsService.creditGamePoints(g.getPlayer1Id(), "SCRABBLE", g.getScore1(), "GAME_WIN", g.getId());
        if (g.getPlayer2Id() != null && !g.getPlayer2Id().equals(COMPUTER_ID))
            pointsService.creditGamePoints(g.getPlayer2Id(), "SCRABBLE", g.getScore2(), "GAME_WIN", g.getId());

        // Rank-scaled gems to a human winner (not the computer, not a tie).
        if (g.getWinnerId() != null && !g.getWinnerId().equals(COMPUTER_ID))
            gemService.creditGems(g.getWinnerId(), rankService.gemsPerWin(g.getWinnerId()), "GAME_REWARD", g.getId());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private ScrabbleGame byCode(String code) {
        return repo.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
    }

    private ScrabbleGame active(UUID gameId, UUID userId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (turnOf(g, userId) != g.getCurrentPlayer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It's not your turn.");
        return g;
    }

    /** 1 or 2; throws if the user isn't a player in this game. */
    private int turnOf(ScrabbleGame g, UUID userId) {
        if (userId.equals(g.getPlayer1Id())) return 1;
        if (userId.equals(g.getPlayer2Id())) return 2;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
    }

    private static String emptyBoard() {
        String row = ".".repeat(ScrabbleBoard.SIZE);
        return String.join("\n", Collections.nCopies(ScrabbleBoard.SIZE, row));
    }

    private static ScrabbleBoard parseBoard(String text) {
        ScrabbleBoard b = new ScrabbleBoard();
        String[] rows = text.split("\n", -1);
        for (int r = 0; r < rows.length; r++) {
            for (int c = 0; c < rows[r].length(); c++) {
                char ch = rows[r].charAt(c);
                if (ch == '.') continue;
                b.place(r, c, Character.toUpperCase(ch), Character.isLowerCase(ch));
            }
        }
        return b;
    }

    private static String serializeBoard(ScrabbleBoard b) {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < ScrabbleBoard.SIZE; r++) {
            if (r > 0) sb.append('\n');
            for (int c = 0; c < ScrabbleBoard.SIZE; c++) {
                if (!b.has(r, c)) sb.append('.');
                else sb.append(b.isBlank(r, c) ? Character.toLowerCase(b.get(r, c)) : b.get(r, c));
            }
        }
        return sb.toString();
    }

    /** Remove the tiles this move uses from the rack; throws if any aren't held. */
    private static String removeFromRack(String rack, List<Placement> placements) {
        StringBuilder sb = new StringBuilder();
        for (Placement p : placements) sb.append(p.blank() ? Letters.BLANK : p.upper());
        return removeChars(rack, sb.toString());
    }

    private static String removeChars(String rack, String toRemove) {
        List<Character> pool = new ArrayList<>();
        for (char c : rack.toCharArray()) pool.add(c);
        for (char c : toRemove.toCharArray()) {
            if (!pool.remove((Character) c))
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Tile not in your rack: " + c);
        }
        StringBuilder kept = new StringBuilder();
        for (char c : pool) kept.append(c);
        return kept.toString();
    }

    private static String drawFromBag(StringBuilder bag, int n) {
        int take = Math.max(0, Math.min(n, bag.length()));
        String drawn = bag.substring(bag.length() - take);
        bag.delete(bag.length() - take, bag.length());
        return drawn;
    }

    private static void shuffle(StringBuilder bag) {
        List<Character> list = new ArrayList<>();
        for (char c : bag.toString().toCharArray()) list.add(c);
        Collections.shuffle(list, new Random());
        bag.setLength(0);
        for (char c : list) bag.append(c);
    }

    private static String chars(List<Character> tiles) {
        StringBuilder sb = new StringBuilder(tiles.size());
        for (char c : tiles) sb.append(c);
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
