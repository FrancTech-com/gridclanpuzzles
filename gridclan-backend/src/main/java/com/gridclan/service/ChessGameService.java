package com.gridclan.service;

import com.gridclan.chess.ChessEngine;
import com.gridclan.entity.ChessGame;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.repository.ChessGameRepository;
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

/**
 * Chess — real-time 2-player games (friend invite or tournament match).
 * Server-authoritative: every move is validated by {@link ChessEngine} against
 * the real position; clients only propose UCI moves and render the result.
 *
 * PvP turn clock: 5 minutes per move — in chess a lapsed clock is a loss on
 * time (the standard rule), not a skipped turn.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChessGameService {

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final SecureRandom RANDOM  = new SecureRandom();
    /** Turn clock: 5 minutes per move, then the mover loses on time. */
    public static final long TURN_SECONDS = 300;
    static final int WIN_POINTS      = 100;
    static final int SPEED_BONUS_MAX = 50;   // decays with game length

    /** Fixed sentinel id for the computer opponent in solo games. */
    public static final UUID COMPUTER_ID = new UUID(0L, 0L);

    private final ChessGameRepository repo;
    private final SimpMessagingTemplate messaging;
    private final PlayerPointsService   pointsService;
    private final GemService            gemService;
    private final RankService           rankService;
    private final UserRepository        userRepo;
    private final ChessAi               ai;
    private final LevelService          levelService;

    // ── Create / join ──────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> create(UUID userId) {
        ChessGame g = ChessGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .status("WAITING_FOR_OPPONENT")
            .currentPlayer((short) 1)
            .fen(ChessEngine.START_FEN)
            .build();
        repo.save(g);
        log.info("Chess game created: code={} creator={}", g.getInviteCode(), userId);
        return view(userId, g);
    }

    /** Start a solo game vs the computer — you play white and move first. Optional
     *  difficulty/level set the AI strength (blunder chance) + points and gate the
     *  locked ladder; pass null difficulty for a plain (non-ladder) solo game. */
    @Transactional
    public Map<String, Object> createSolo(UUID userId, Difficulty difficulty, int level) {
        if (difficulty != null) {
            levelService.requireUnlocked(userId, "CHESS", difficulty, level);
        }
        ChessGame g = ChessGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(userId)
            .player2Id(COMPUTER_ID)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .fen(ChessEngine.START_FEN)
            .vsComputer(true)
            .difficulty(difficulty != null ? difficulty.name() : null)
            .level(difficulty != null ? level : 0)
            .build();
        repo.save(g);
        log.info("Chess solo game created: creator={} diff={} level={}", userId, difficulty, level);
        return view(userId, g);
    }

    @Transactional
    public Map<String, Object> join(UUID userId, String code) {
        ChessGame g = byCode(code);
        if (userId.equals(g.getPlayer1Id()) || userId.equals(g.getPlayer2Id()))
            return view(userId, g);   // already seated — reopen
        if (g.getPlayer2Id() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is already full.");

        g.setPlayer2Id(userId);
        g.setStatus("ACTIVE");
        g.setLastMoveAt(Instant.now());   // white's clock starts now
        repo.save(g);
        log.info("Chess game joined: code={} black={}", code, userId);
        broadcast(g);
        return view(userId, g);
    }

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a fully-initialized, pre-paired ACTIVE game for a bracket match. */
    @Transactional
    public UUID createMatch(UUID p1, UUID p2) {
        ChessGame g = ChessGame.builder()
            .inviteCode(uniqueCode())
            .player1Id(p1).player2Id(p2)
            .status("ACTIVE")
            .currentPlayer((short) 1)
            .fen(ChessEngine.START_FEN)
            .build();
        repo.save(g);
        return g.getId();
    }

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

    // ── Moves ──────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> move(UUID userId, UUID gameId, String uci) {
        ChessGame g = active(gameId, userId);
        ChessEngine engine = ChessEngine.fromFen(g.getFen());

        String mv = normalize(uci);
        if (!engine.legalMoves().contains(mv))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Illegal move.");

        engine.applyUci(mv);
        g.setFen(engine.toFen());
        g.setMoveLog(g.getMoveLog().isEmpty() ? mv : g.getMoveLog() + " " + mv);
        g.setCurrentPlayer((short) (engine.whiteToMove() ? 1 : 2));
        g.setLastMoveAt(Instant.now());

        String status = engine.status();
        switch (status) {
            case "CHECKMATE" -> finishWin(g, userId, "CHECKMATE", engine.fullmoveNumber());
            case "STALEMATE", "DRAW_50", "DRAW_MATERIAL" -> finishDraw(g, status);
            default -> { }
        }

        // Solo: the computer (black) replies at once so the returned view already
        // reflects its move.
        if (g.isVsComputer() && "ACTIVE".equals(g.getStatus())) aiRespond(g);

        repo.save(g);
        broadcast(g);
        return view(userId, g);
    }

    /** The computer (black) plays its reply, updating the game in place. */
    private void aiRespond(ChessGame g) {
        ChessEngine engine = ChessEngine.fromFen(g.getFen());
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        double blunder = d != null ? d.aiBlunderChance(g.getLevel()) : 0.0;
        String mv = ai.bestMove(engine, blunder);
        if (mv == null) return;   // no legal move (shouldn't happen while ACTIVE)

        engine.applyUci(mv);
        g.setFen(engine.toFen());
        g.setMoveLog(g.getMoveLog().isEmpty() ? mv : g.getMoveLog() + " " + mv);
        g.setCurrentPlayer((short) (engine.whiteToMove() ? 1 : 2));
        g.setLastMoveAt(Instant.now());

        switch (engine.status()) {
            case "CHECKMATE" -> finishWin(g, COMPUTER_ID, "CHECKMATE", 0);   // computer wins
            case "STALEMATE", "DRAW_50", "DRAW_MATERIAL" -> finishDraw(g, engine.status());
            default -> { }
        }
    }

    /** Forfeit (resign): the opponent wins immediately. */
    @Transactional
    public Map<String, Object> forfeit(UUID userId, UUID gameId) {
        ChessGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        int me = seatOf(g, userId);
        if (me == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.getPlayer2Id() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No opponent to forfeit to yet.");

        UUID opponent = me == 1 ? g.getPlayer2Id() : g.getPlayer1Id();
        finishWin(g, opponent, "RESIGN", 0);
        g.setLastMoveAt(Instant.now());
        repo.save(g);
        broadcast(g);
        log.info("Chess forfeit: game={} forfeiter={} winner={}", g.getId(), userId, opponent);
        return view(userId, g);
    }

    @Transactional
    public Map<String, Object> get(UUID userId, UUID gameId) {
        ChessGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        return view(userId, g);
    }

    // ── Turn clock (loss on time) ─────────────────────────────────────────────

    private Instant turnDeadline(ChessGame g) {
        // No clock on a solo game (vs the computer) or a paused / unstarted game.
        if (!"ACTIVE".equals(g.getStatus()) || g.getPlayer2Id() == null
                || g.isVsComputer() || g.getPausedAt() != null) return null;
        return g.getLastMoveAt().plusSeconds(TURN_SECONDS);
    }

    // ── Pause / resume ─────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> pause(UUID userId, UUID gameId) {
        ChessGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (seatOf(g, userId) == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
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
        ChessGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        if (seatOf(g, userId) == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (g.getPausedAt() != null) {
            g.setPausedAt(null);
            g.setLastMoveAt(Instant.now());
            repo.save(g);
            broadcast(g);
        }
        return view(userId, g);
    }

    @Transactional
    public boolean enforceTurnClock(ChessGame g) {
        Instant deadline = turnDeadline(g);
        if (deadline == null || !Instant.now().isAfter(deadline)) return false;
        UUID loser  = g.getCurrentPlayer() == 1 ? g.getPlayer1Id() : g.getPlayer2Id();
        UUID winner = g.getCurrentPlayer() == 1 ? g.getPlayer2Id() : g.getPlayer1Id();
        finishWin(g, winner, "TIMEOUT", 0);
        g.setLastMoveAt(Instant.now());
        repo.save(g);
        broadcast(g);
        log.info("Chess timeout: game={} loser={} winner={}", g.getId(), loser, winner);
        return true;
    }

    /** Sweep every ACTIVE game whose clock has lapsed (TurnTimerJob). */
    @Transactional
    public int sweepTurnClocks() {
        int n = 0;
        for (ChessGame g : repo.findByStatus("ACTIVE")) {
            if (enforceTurnClock(g)) n++;
        }
        return n;
    }

    // ── View ─────────────────────────────────────────────────────────────────

    private Map<String, Object> view(UUID userId, ChessGame g) {
        int me = seatOf(g, userId);
        ChessEngine engine = ChessEngine.fromFen(g.getFen());
        boolean yourTurn = me != 0 && me == g.getCurrentPlayer() && "ACTIVE".equals(g.getStatus());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",      g.getId());
        out.put("inviteCode",  g.getInviteCode());
        out.put("status",      g.getStatus());
        out.put("board",       engine.rows());          // rank 8 → rank 1; '.'=empty, UPPER=white
        out.put("fen",         g.getFen());
        out.put("yourColor",   me == 1 ? "WHITE" : me == 2 ? "BLACK" : null);
        out.put("yourTurn",    yourTurn);
        out.put("currentColor", g.getCurrentPlayer() == 1 ? "WHITE" : "BLACK");
        out.put("hasOpponent", g.getPlayer2Id() != null);
        out.put("spectator",   me == 0);
        out.put("paused",      g.getPausedAt() != null);
        out.put("vsComputer",  g.isVsComputer());
        if (g.getLevel() > 0) {              // solo ladder game → let the client offer "Next level"
            out.put("difficulty", g.getDifficulty());
            out.put("level",      g.getLevel());
        }
        out.put("inCheck",     "ACTIVE".equals(g.getStatus()) && engine.inCheck());
        out.put("legalMoves",  yourTurn ? engine.legalMoves() : List.of());
        List<String> moves = g.getMoveLog().isEmpty()
            ? List.of() : Arrays.asList(g.getMoveLog().split(" "));
        out.put("moveLog",     moves);
        out.put("lastMove",    moves.isEmpty() ? null : moves.get(moves.size() - 1));
        out.put("players", List.of(
            playerView(g.getPlayer1Id(), "WHITE", g),
            playerView(g.getPlayer2Id(), "BLACK", g)));
        Instant deadline = turnDeadline(g);
        out.put("turnDeadline", deadline != null ? deadline.toEpochMilli() : null);
        if ("COMPLETE".equals(g.getStatus())) {
            out.put("endReason", g.getEndReason());
            out.put("outcome", me == 0 ? "SPECTATOR"
                : g.getWinnerId() == null ? "TIE"
                : g.getWinnerId().equals(userId) ? "WON" : "LOST");
            out.put("winnerName", g.getWinnerId() != null ? displayName(g.getWinnerId()) : null);
        }
        return out;
    }

    private Map<String, Object> playerView(UUID pid, String color, ChessGame g) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("color", color);
        p.put("name",  pid == null ? null : displayName(pid));
        p.put("current", "ACTIVE".equals(g.getStatus())
            && (g.getCurrentPlayer() == 1 ? "WHITE" : "BLACK").equals(color));
        return p;
    }

    private void broadcast(ChessGame g) {
        try {
            messaging.convertAndSend("/topic/chess/" + g.getId(), Map.of(
                "gameId",        g.getId().toString(),
                "status",        g.getStatus(),
                "currentPlayer", g.getCurrentPlayer(),
                "version",       g.getLastMoveAt().toEpochMilli()
            ));
        } catch (Exception ignored) { /* live updates are never fatal */ }
    }

    // ── Finish ───────────────────────────────────────────────────────────────

    private void finishWin(ChessGame g, UUID winner, String reason, int fullmoves) {
        g.setStatus("COMPLETE");
        g.setWinnerId(winner);
        g.setEndReason(reason);

        // The computer earns nothing; and a beaten human just loses (no award).
        if (COMPUTER_ID.equals(winner)) return;

        int award = WIN_POINTS + (fullmoves > 0 ? Math.max(0, SPEED_BONUS_MAX - fullmoves) : 0);

        // Solo win: scale by difficulty×level and unlock the next ladder rung.
        Difficulty d = Difficulty.fromName(g.getDifficulty());
        if (g.isVsComputer() && d != null) award = (int) Math.round(award * d.pointsMultiplierFor(g.getLevel()));

        pointsService.creditGamePoints(winner, "CHESS", award, "GAME_WIN", g.getId());
        gemService.creditGems(winner, rankService.gemsPerWin(winner), "GAME_REWARD", g.getId());
        if (g.isVsComputer() && d != null)
            levelService.recordCompletion(winner, "CHESS", d, g.getLevel(), award);
    }

    private void finishDraw(ChessGame g, String reason) {
        g.setStatus("COMPLETE");
        g.setWinnerId(null);
        g.setEndReason(reason);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static String normalize(String uci) {
        if (uci == null) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Missing move.");
        String mv = uci.trim().toLowerCase();
        if (!mv.matches("[a-h][1-8][a-h][1-8][qrbn]?"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Bad move format.");
        return mv;
    }

    private int seatOf(ChessGame g, UUID userId) {
        if (userId.equals(g.getPlayer1Id())) return 1;
        if (userId.equals(g.getPlayer2Id())) return 2;
        return 0;
    }

    private ChessGame byCode(String code) {
        return repo.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
    }

    private ChessGame active(UUID gameId, UUID userId) {
        ChessGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.getPausedAt() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is paused — resume to play.");
        int me = seatOf(g, userId);
        if (me == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not in this game.");
        if (me != g.getCurrentPlayer())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It's not your turn.");
        return g;
    }

    private String displayName(UUID userId) {
        if (COMPUTER_ID.equals(userId)) return "Computer";
        return userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");
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
