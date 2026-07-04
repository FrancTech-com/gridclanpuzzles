package com.gridclan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.entity.ScrabbleGame;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.gridscrabble.*;
import com.gridclan.repository.ScrabbleGameRepository;
import com.gridclan.repository.UserRepository;
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
import java.util.concurrent.ThreadLocalRandom;

/**
 * Grid Scrabble — shared-board, turn-based games for 2-4 players.
 * Server-authoritative: the board, bag and racks live here; the client only
 * proposes tile placements, which MoveValidator checks against the real rules
 * and the player's actual rack.
 *
 * Standard scoring is enforced end to end: letter/word premiums and the +50
 * bingo bonus in {@link MoveValidator}, plus the standard end-of-game rack
 * adjustment here (everyone loses the value of their unplayed tiles; a player
 * who goes out also gains the value of everyone else's).
 *
 * PvP games run a 5-minute turn clock: when it expires the turn auto-passes
 * to the next player (see {@link #enforceTurnClock} and TurnTimerJob).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScrabbleGameService {

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final SecureRandom RANDOM  = new SecureRandom();
    private static final ObjectMapper JSON    = new ObjectMapper();
    // Flat points handed to the opponent when a player forfeits a head-to-head
    // game, so a concession is always worth points to them.
    private static final int    FORFEIT_WIN_POINTS = 100;
    /** PvP turn clock: 5 minutes per move, then the turn auto-passes. */
    public static final long    TURN_SECONDS = 300;
    /** Keep at most this many entries in a game's move log. */
    private static final int    MOVE_LOG_MAX = 300;

    /** Fixed sentinel id for the computer opponent in solo games. */
    public static final UUID COMPUTER_ID = new UUID(0L, 0L);

    private final ScrabbleGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService    pointsService;
    private final GemService             gemService;
    private final RankService            rankService;
    private final ScrabbleAi             ai;
    private final LevelService           levelService;
    private final UserRepository         userRepo;

    // Dictionary loaded once (SOWPODS, ≈268k words). Lazy so startup isn't blocked.
    private volatile WordList dict;
    private WordList dict() {
        WordList d = dict;
        if (d == null) synchronized (this) { if ((d = dict) == null) dict = d = WordList.fromResource(); }
        return d;
    }

    // ── Create / join ──────────────────────────────────────────────────────

    /** Start a friend game for {@code players} seats (2-4). Fills as friends join. */
    @Transactional
    public Map<String, Object> create(UUID userId, int players) {
        if (players < 2 || players > 4)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A game seats 2 to 4 players.");
        TileBag bag = new TileBag(RANDOM.nextLong());
        String rack1 = chars(bag.draw(TileBag.RACK_SIZE));
        String bagStr = chars(bag.snapshot());

        ScrabbleGame g = ScrabbleGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .maxPlayers((short) players)
            .status("WAITING_FOR_OPPONENT")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .bag(bagStr)
            .rack1(rack1)
            .build();
        repo.save(g);
        log.info("Scrabble game created: code={} creator={} seats={}", g.getInviteCode(), userId, players);
        return view(userId, g);
    }

    /** Start a solo game vs the computer — both racks drawn, ACTIVE at once, you
     *  move first. Free hints are granted by rank (Beginner 5 / Amateur 3 / Pro 0).
     *  Optional difficulty/level set the AI strength + points and gate the ladder. */
    @Transactional
    public Map<String, Object> createSolo(UUID userId, Difficulty difficulty, int level) {
        if (difficulty != null) {
            levelService.requireUnlocked(userId, "SCRABBLE", difficulty, level);
        }
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
            .difficulty(difficulty != null ? difficulty.name() : null)
            .level(difficulty != null ? level : 0)
            .build();
        repo.save(g);
        log.info("Scrabble solo game created: creator={} diff={} level={} hints={}",
            userId, difficulty, level, g.getHintsRemaining());
        return view(userId, g);
    }

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a fully-initialized, pre-paired ACTIVE head-to-head bracket game. */
    @Transactional
    public UUID createMatch(UUID p1, UUID p2) {
        return createGroupMatch(List.of(p1, p2));
    }

    /** Create a pre-seated ACTIVE game for 2-4 tournament players (group game). */
    @Transactional
    public UUID createGroupMatch(List<UUID> players) {
        if (players == null || players.size() < 2 || players.size() > 4)
            throw new IllegalArgumentException("A Scrabble match seats 2 to 4 players.");
        TileBag bag = new TileBag(RANDOM.nextLong());

        ScrabbleGame g = ScrabbleGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(players.get(0))
            .maxPlayers((short) players.size())
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .board(emptyBoard())
            .bag("")
            .build();
        for (int s = 1; s <= players.size(); s++) {
            g.setPlayerId(s, players.get(s - 1));
            g.setRack(s, chars(bag.draw(TileBag.RACK_SIZE)));
        }
        g.setBag(chars(bag.snapshot()));
        repo.save(g);
        return g.getId();
    }

    /** True once the backing game has finished. */
    @Transactional(readOnly = true)
    public boolean isMatchComplete(UUID gameId) {
        return repo.findById(gameId).map(g -> "COMPLETE".equals(g.getStatus())).orElse(false);
    }

    /** Winner of a finished game; a tie is broken deterministically to the earlier seat. */
    @Transactional(readOnly = true)
    public UUID matchWinner(UUID gameId) {
        List<UUID> ranking = matchRanking(gameId);
        return ranking.isEmpty() ? null : ranking.get(0);
    }

    /** Final standings of a finished game: best score first (resigned players last). */
    @Transactional(readOnly = true)
    public List<UUID> matchRanking(UUID gameId) {
        ScrabbleGame g = repo.findById(gameId).orElse(null);
        if (g == null) return List.of();
        List<Integer> seats = new ArrayList<>();
        for (int s = 1; s <= g.getMaxPlayers(); s++) if (g.playerId(s) != null) seats.add(s);
        seats.sort(Comparator
            .comparing((Integer s) -> g.isResigned(s))          // resigned players last
            .thenComparing(s -> -g.score(s))                    // then best score first
            .thenComparing(s -> s));                            // stable tie-break
        // A stored winner (e.g. head-to-head forfeit) always ranks first.
        List<UUID> out = new ArrayList<>();
        if (g.getWinnerId() != null) out.add(g.getWinnerId());
        for (int s : seats) {
            UUID id = g.playerId(s);
            if (!out.contains(id)) out.add(id);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> join(UUID userId, String code) {
        ScrabbleGame g = byCode(code);
        if (g.seatOf(userId) != 0) return view(userId, g);   // already seated — reopen
        if (!"WAITING_FOR_OPPONENT".equals(g.getStatus()) || g.seatedCount() >= g.getMaxPlayers())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is already full.");

        int seat = g.seatedCount() + 1;
        StringBuilder bag = new StringBuilder(g.getBag());
        g.setPlayerId(seat, userId);
        g.setRack(seat, drawFromBag(bag, TileBag.RACK_SIZE));
        g.setBag(bag.toString());
        if (g.seatedCount() >= g.getMaxPlayers()) {
            g.setStatus("ACTIVE");
            g.setLastMoveAt(Instant.now());   // the first player's turn clock starts now
        }
        repo.save(g);
        log.info("Scrabble game joined: code={} player={} seat={}/{}", code, userId, seat, g.getMaxPlayers());
        broadcast(g);   // tell the others (live) that someone joined / the game started
        return view(userId, g);
    }

    // ── Turns ──────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> move(UUID userId, UUID gameId, List<Placement> placements) {
        ScrabbleGame g = active(gameId, userId);
        int me = g.seatOf(userId);

        // 1. Tiles must come from the player's actual rack.
        String afterRemoval = removeFromRack(g.rack(me), placements);

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
        g.setRack(me, newRack);
        g.setScore(me, g.score(me) + res.score());

        g.setPassStreak((short) 0);
        g.setLastMoveAt(Instant.now());
        logMove(g, me, "WORD", Map.of(
            "words", res.words(),
            "score", res.score(),
            "bingo", placements.size() == TileBag.RACK_SIZE));

        // 4. Game over when the bag is empty and the mover cleared their rack.
        if (bag.length() == 0 && newRack.isEmpty()) finish(g, me);
        else {
            advanceTurn(g, me);
            if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        }

        repo.save(g);
        broadcast(g);   // the other players' devices update live
        return view(userId, g);
    }

    /** The computer (player 2) takes its turn: play its best word, else pass. On a
     *  ladder game it sometimes passes on purpose (easier levels = more often), so
     *  the human can out-score it. */
    private void aiPlay(ScrabbleGame g) {
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        double blunder = d != null ? d.aiBlunderChance(g.getLevel()) : 0.0;
        if (blunder > 0 && ThreadLocalRandom.current().nextDouble() < blunder) {
            aiPass(g);
            return;
        }

        ScrabbleBoard board = parseBoard(g.getBoard());
        List<Placement> best = ai.bestMove(board, g.getRack2(), dict());

        if (best == null || best.isEmpty()) {
            aiPass(g);   // no legal move found — the computer passes
            return;
        }

        MoveValidator.Result res = MoveValidator.validate(board, best, dict());
        if (!res.valid()) {   // defensive — should never happen
            aiPass(g);
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
        logMove(g, 2, "WORD", Map.of(
            "words", res.words(),
            "score", res.score(),
            "bingo", best.size() == TileBag.RACK_SIZE));

        if (bag.length() == 0 && newRack.isEmpty()) finish(g, 2);
        else g.setCurrentPlayer((short) 1);   // back to the human
    }

    private void aiPass(ScrabbleGame g) {
        g.setPassStreak((short) (g.getPassStreak() + 1));
        logMove(g, 2, "PASS", Map.of());
        if (g.getPassStreak() >= 2 * g.activeCount()) finish(g, 0);
        else g.setCurrentPlayer((short) 1);
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
        int me = g.seatOf(userId);
        g.setPassStreak((short) (g.getPassStreak() + 1));
        g.setLastMoveAt(Instant.now());
        logMove(g, me, "PASS", Map.of());
        if (g.getPassStreak() >= 2 * g.activeCount()) finish(g, 0);   // everyone passed twice
        else {
            advanceTurn(g, me);
            if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        }
        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    @Transactional
    public Map<String, Object> exchange(UUID userId, UUID gameId, String tiles) {
        ScrabbleGame g = active(gameId, userId);
        int me = g.seatOf(userId);
        StringBuilder bag = new StringBuilder(g.getBag());
        if (bag.length() < TileBag.RACK_SIZE)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Not enough tiles left to exchange.");

        String kept = removeChars(g.rack(me), tiles);    // validates the tiles are in the rack
        String drawn = drawFromBag(bag, tiles.length());
        bag.append(tiles);                                // return exchanged tiles
        shuffle(bag);
        g.setBag(bag.toString());
        g.setRack(me, kept + drawn);

        g.setPassStreak((short) 0);
        g.setLastMoveAt(Instant.now());
        logMove(g, me, "SWAP", Map.of("count", tiles.length()));
        advanceTurn(g, me);
        if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiPlay(g);
        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    /**
     * Forfeit (resign). Head-to-head: the opponent wins at once, banks their word
     * points plus a flat forfeit award and win gems. In a 3-4 player game the
     * resigner drops out and play continues; when only one player is left the
     * game finishes normally (with the standard rack adjustments).
     */
    @Transactional
    public Map<String, Object> forfeit(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        int me = g.seatOf(userId);
        if (me == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.seatedCount() < 2)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No opponent to forfeit to yet.");

        g.setLastMoveAt(Instant.now());
        logMove(g, me, "RESIGN", Map.of());

        if (g.getMaxPlayers() <= 2) {
            UUID opponentId = g.playerId(me == 1 ? 2 : 1);
            g.setStatus("COMPLETE");
            g.setWinnerId(opponentId);

            // Each player banks the word points they earned this game.
            for (int s = 1; s <= 2; s++) {
                UUID pid = g.playerId(s);
                if (pid != null && !pid.equals(COMPUTER_ID))
                    pointsService.creditGamePoints(pid, "SCRABBLE", g.score(s), "GAME_WIN", g.getId());
            }
            // Flat forfeit award + rank-scaled gems to a human opponent, so a
            // concession is always worth a clear win reward to them.
            if (!COMPUTER_ID.equals(opponentId)) {
                pointsService.creditGamePoints(opponentId, "SCRABBLE", FORFEIT_WIN_POINTS, "GAME_FORFEIT", g.getId());
                gemService.creditGems(opponentId, rankService.gemsPerWin(opponentId), "GAME_REWARD", g.getId());
            }
        } else {
            g.markResigned(me);
            if (g.activeCount() <= 1) {
                finish(g, 0);
            } else if (g.getCurrentPlayer() == me) {
                advanceTurn(g, me);
            }
        }

        repo.save(g);
        broadcast(g);
        log.info("Scrabble forfeit: game={} forfeiter={}", g.getId(), userId);
        return view(userId, g);
    }

    @Transactional
    public Map<String, Object> get(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        return view(userId, g);
    }

    // ── Turn clock ────────────────────────────────────────────────────────────

    /** When this game's current turn must be played by (PvP + ACTIVE, not paused). */
    private Instant turnDeadline(ScrabbleGame g) {
        if (!"ACTIVE".equals(g.getStatus()) || g.isVsComputer() || g.getPausedAt() != null) return null;
        return g.getLastMoveAt().plusSeconds(TURN_SECONDS);
    }

    // ── Pause / resume (any player; freezes the turn clock) ────────────────────

    @Transactional
    public Map<String, Object> pause(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (g.seatOf(userId) == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (!"ACTIVE".equals(g.getStatus()) || g.isVsComputer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a live multiplayer game can be paused.");
        if (g.getPausedAt() == null) { g.setPausedAt(Instant.now()); repo.save(g); broadcast(g); }
        return view(userId, g);
    }

    /** System-initiated pause/resume (e.g. a tournament pausing all its matches). */
    @Transactional
    public void setPaused(UUID gameId, boolean paused) {
        repo.findById(gameId).ifPresent(g -> {
            if (!"ACTIVE".equals(g.getStatus())) return;
            if (paused && g.getPausedAt() == null) g.setPausedAt(Instant.now());
            else if (!paused && g.getPausedAt() != null) { g.setPausedAt(null); g.setLastMoveAt(Instant.now()); }
            else return;
            repo.save(g);
            broadcast(g);
        });
    }

    @Transactional
    public Map<String, Object> resume(UUID userId, UUID gameId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (g.seatOf(userId) == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (g.getPausedAt() != null) {
            g.setPausedAt(null);
            g.setLastMoveAt(Instant.now());   // fresh turn window for the current player
            repo.save(g);
            broadcast(g);
        }
        return view(userId, g);
    }

    /**
     * If the current player's 5 minutes are up, auto-pass their turn (and keep
     * going if the next player's window has also lapsed — e.g. after downtime).
     * Called lazily from {@link #get} and periodically from TurnTimerJob.
     */
    @Transactional
    public boolean enforceTurnClock(ScrabbleGame g) {
        boolean changed = false;
        int guard = 0;
        Instant deadline;
        while ((deadline = turnDeadline(g)) != null && Instant.now().isAfter(deadline) && guard++ < 16) {
            int seat = g.getCurrentPlayer();
            g.setPassStreak((short) (g.getPassStreak() + 1));
            g.setLastMoveAt(deadline);   // the next player's window starts where this one lapsed
            logMove(g, seat, "TIMEOUT", Map.of());
            if (g.getPassStreak() >= 2 * g.activeCount()) finish(g, 0);
            else advanceTurn(g, seat);
            changed = true;
        }
        if (changed) {
            repo.save(g);
            broadcast(g);
        }
        return changed;
    }

    /** Sweep every ACTIVE PvP game whose turn clock has lapsed (TurnTimerJob). */
    @Transactional
    public int sweepTurnClocks() {
        int n = 0;
        for (ScrabbleGame g : repo.findByStatus("ACTIVE")) {
            if (!g.isVsComputer() && enforceTurnClock(g)) n++;
        }
        return n;
    }

    // ── View (hides the other players' racks) ─────────────────────────────────

    private Map<String, Object> view(UUID userId, ScrabbleGame g) {
        int me = g.seatOf(userId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",       g.getId());
        out.put("inviteCode",   g.getInviteCode());
        out.put("status",       g.getStatus());
        out.put("board",        Arrays.asList(g.getBoard().split("\n", -1)));
        out.put("yourRack",     me == 0 ? "" : g.rack(me));
        out.put("yourTurn",     me != 0 && me == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus()));
        out.put("yourScore",    me == 0 ? g.getScore1() : g.score(me));
        out.put("opponentScore", bestOtherScore(g, me));
        out.put("hasOpponent",  g.seatedCount() >= g.getMaxPlayers());
        out.put("tilesInBag",   g.getBag().length());
        out.put("vsComputer",   g.isVsComputer());
        out.put("hintsRemaining", g.getHintsRemaining());
        out.put("maxPlayers",   (int) g.getMaxPlayers());
        out.put("seatedCount",  g.seatedCount());
        out.put("yourSeat",     me);
        out.put("spectator",    me == 0);
        out.put("players",      playersView(g));
        out.put("moveLog",      moveLogView(g, 60));
        Instant deadline = turnDeadline(g);
        out.put("turnDeadline", deadline != null ? deadline.toEpochMilli() : null);
        out.put("paused",       g.getPausedAt() != null);
        if (g.getLevel() > 0) {              // solo ladder game → let the client offer "Next level"
            out.put("difficulty", g.getDifficulty());
            out.put("level",      g.getLevel());
        }
        if ("COMPLETE".equals(g.getStatus())) {
            UUID w = g.getWinnerId();
            out.put("outcome", me == 0 ? "SPECTATOR"
                : w == null ? "TIE"
                : w.equals(userId) ? "WON" : "LOST");
            out.put("winnerName", w != null ? displayName(w) : null);
        }
        return out;
    }

    /** Everyone's public state: seat, name, score, turn/resigned flags. */
    private List<Map<String, Object>> playersView(ScrabbleGame g) {
        List<Map<String, Object>> players = new ArrayList<>();
        for (int s = 1; s <= g.getMaxPlayers(); s++) {
            UUID pid = g.playerId(s);
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("seat",     s);
            p.put("name",     pid == null ? null : displayName(pid));
            p.put("score",    g.score(s));
            p.put("current",  s == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus()));
            p.put("resigned", g.isResigned(s));
            p.put("tiles",    g.rack(s).length());     // count only — never the letters
            players.add(p);
        }
        return players;
    }

    private int bestOtherScore(ScrabbleGame g, int me) {
        int best = 0;
        for (int s = 1; s <= g.getMaxPlayers(); s++) {
            if (s == me || g.playerId(s) == null) continue;
            best = Math.max(best, g.score(s));
        }
        return best;
    }

    /**
     * Push a lightweight "state changed" ping to the players over WebSocket so their clients
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

    /**
     * Finish the game with the standard end-of-game adjustment: every player
     * loses the value of the tiles left on their rack; if {@code outSeat} went
     * out (emptied their rack with an empty bag) they also gain the sum of
     * everyone else's unplayed tiles. Then rank, pick the winner and pay out.
     */
    private void finish(ScrabbleGame g, int outSeat) {
        g.setStatus("COMPLETE");

        int leftoverSum = 0;
        for (int s = 1; s <= g.getMaxPlayers(); s++) {
            if (g.playerId(s) == null) continue;
            int left = rackValue(g.rack(s));
            leftoverSum += left;
            if (s != outSeat) g.setScore(s, g.score(s) - left);
        }
        if (outSeat != 0) g.setScore(outSeat, g.score(outSeat) + leftoverSum);

        // Winner: best adjusted score among players who didn't resign.
        int bestSeat = 0;
        for (int s = 1; s <= g.getMaxPlayers(); s++) {
            if (g.playerId(s) == null || g.isResigned(s)) continue;
            if (bestSeat == 0 || g.score(s) > g.score(bestSeat)) bestSeat = s;
        }
        boolean tie = false;
        if (bestSeat != 0) {
            for (int s = 1; s <= g.getMaxPlayers(); s++) {
                if (s != bestSeat && g.playerId(s) != null && !g.isResigned(s)
                        && g.score(s) == g.score(bestSeat)) tie = true;
            }
        }
        g.setWinnerId(bestSeat == 0 || (tie && g.getMaxPlayers() <= 2) ? null : g.playerId(bestSeat));

        logMove(g, outSeat, "GAME_END", Map.of());

        // Native scoring: each player banks the word points they earned this game
        // (never negative; creditGamePoints no-ops on 0). Feeds the SCRABBLE leaderboard.
        // On a solo ladder game the human's (player1) award is scaled by difficulty×level.
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        for (int s = 1; s <= g.getMaxPlayers(); s++) {
            UUID pid = g.playerId(s);
            if (pid == null || pid.equals(COMPUTER_ID)) continue;
            int award = Math.max(0, g.score(s));
            if (s == 1 && d != null) award = (int) Math.round(award * d.pointsMultiplierFor(g.getLevel()));
            pointsService.creditGamePoints(pid, "SCRABBLE", award, "GAME_WIN", g.getId());
        }

        // Rank-scaled gems to a human winner (not the computer, not a tie).
        if (g.getWinnerId() != null && !g.getWinnerId().equals(COMPUTER_ID))
            gemService.creditGems(g.getWinnerId(), rankService.gemsPerWin(g.getWinnerId()), "GAME_REWARD", g.getId());

        // Ladder: the human clearing the level (beating the computer) unlocks the next.
        if (d != null && g.getPlayer1Id().equals(g.getWinnerId())) {
            int p1Award = (int) Math.round(Math.max(0, g.getScore1()) * d.pointsMultiplierFor(g.getLevel()));
            levelService.recordCompletion(g.getPlayer1Id(), "SCRABBLE", d, g.getLevel(), p1Award);
        }
    }

    private static int rackValue(String rack) {
        int v = 0;
        for (char c : rack.toCharArray()) v += Letters.value(c);
        return v;
    }

    // ── Move log ──────────────────────────────────────────────────────────────

    private void logMove(ScrabbleGame g, int seat, String type, Map<String, Object> extra) {
        try {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("at",   Instant.now().toEpochMilli());
            entry.put("seat", seat);
            entry.put("type", type);
            entry.putAll(extra);
            String line = JSON.writeValueAsString(entry);
            String logText = g.getMoveLog() == null || g.getMoveLog().isEmpty()
                ? line : g.getMoveLog() + "\n" + line;
            // Cap the log so a marathon game can't grow the row unboundedly.
            String[] lines = logText.split("\n", -1);
            if (lines.length > MOVE_LOG_MAX) {
                logText = String.join("\n",
                    Arrays.copyOfRange(lines, lines.length - MOVE_LOG_MAX, lines.length));
            }
            g.setMoveLog(logText);
        } catch (Exception ignored) { /* the log is best-effort, never fatal */ }
    }

    /** The last {@code limit} log entries, oldest first, with player names resolved. */
    private List<Map<String, Object>> moveLogView(ScrabbleGame g, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        String logText = g.getMoveLog();
        if (logText == null || logText.isEmpty()) return out;
        String[] lines = logText.split("\n", -1);
        int from = Math.max(0, lines.length - limit);
        for (int i = from; i < lines.length; i++) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> entry = JSON.readValue(lines[i], Map.class);
                Object seat = entry.get("seat");
                if (seat instanceof Number n && n.intValue() > 0) {
                    UUID pid = g.playerId(n.intValue());
                    entry.put("player", pid == null ? null : displayName(pid));
                }
                out.add(entry);
            } catch (Exception ignored) { /* skip a malformed line */ }
        }
        return out;
    }

    private String displayName(UUID userId) {
        if (userId == null) return null;
        if (COMPUTER_ID.equals(userId)) return "Computer";
        return userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Advance to the next seated, non-resigned player after {@code from}. */
    private void advanceTurn(ScrabbleGame g, int from) {
        int seat = from;
        for (int i = 0; i < g.getMaxPlayers(); i++) {
            seat = seat % g.getMaxPlayers() + 1;
            if (g.playerId(seat) != null && !g.isResigned(seat)) {
                g.setCurrentPlayer((short) seat);
                return;
            }
        }
    }

    private ScrabbleGame byCode(String code) {
        return repo.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
    }

    private ScrabbleGame active(UUID gameId, UUID userId) {
        ScrabbleGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.getPausedAt() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is paused — resume to play.");
        int me = g.seatOf(userId);
        if (me == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (g.isResigned(me))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You resigned from this game.");
        if (me != g.getCurrentPlayer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It's not your turn.");
        return g;
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
