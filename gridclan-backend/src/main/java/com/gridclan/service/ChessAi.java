package com.gridclan.service;

import com.gridclan.chess.ChessEngine;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * A compact chess engine opponent: negamax with alpha-beta pruning over a
 * material + piece-square evaluation. Strength is tuned by the caller's
 * {@code blunderChance} (from the difficulty ladder): with that probability the
 * computer plays a random legal move instead of its best, so Easy blunders often
 * and Hard almost never. Depth is small (server-side, per-move, synchronous) but
 * enough to punish hanging pieces and simple tactics.
 */
@Service
public class ChessAi {

    private static final int SEARCH_DEPTH = 3;
    private static final int MATE = 1_000_000;

    // Centipawn piece values, indexed by piece letter.
    private static int pieceValue(char p) {
        return switch (Character.toUpperCase(p)) {
            case 'P' -> 100; case 'N' -> 320; case 'B' -> 330;
            case 'R' -> 500; case 'Q' -> 900; case 'K' -> 0;
            default -> 0;
        };
    }

    // Piece-square tables (white's view, rank 8 → rank 1 to match ChessEngine.rows()).
    private static final int[] PAWN = {
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0,
    };
    private static final int[] KNIGHT = {
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50,
    };
    private static final int[] BISHOP = {
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20,
    };
    private static final int[] ROOK = {
          0,  0,  0,  0,  0,  0,  0,  0,
          5, 10, 10, 10, 10, 10, 10,  5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
          0,  0,  0,  5,  5,  0,  0,  0,
    };
    private static final int[] QUEEN = {
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20,
    };
    private static final int[] KING = {
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20,
    };

    private static int[] table(char piece) {
        return switch (Character.toUpperCase(piece)) {
            case 'P' -> PAWN; case 'N' -> KNIGHT; case 'B' -> BISHOP;
            case 'R' -> ROOK; case 'Q' -> QUEEN; case 'K' -> KING;
            default -> null;
        };
    }

    /** Best move (UCI) for the side to move, or null if there are none. */
    public String bestMove(ChessEngine pos, double blunderChance) {
        List<String> legal = pos.legalMoves();
        if (legal.isEmpty()) return null;

        if (blunderChance > 0 && ThreadLocalRandom.current().nextDouble() < blunderChance) {
            return legal.get(ThreadLocalRandom.current().nextInt(legal.size()));
        }

        String best = legal.get(0);
        int bestScore = Integer.MIN_VALUE;
        int alpha = -MATE - 1, beta = MATE + 1;
        for (String mv : ordered(pos, legal)) {
            ChessEngine next = pos.copy();
            next.applyUci(mv);
            int score = -negamax(next, SEARCH_DEPTH - 1, -beta, -alpha);
            if (score > bestScore) { bestScore = score; best = mv; }
            if (score > alpha) alpha = score;
        }
        return best;
    }

    private int negamax(ChessEngine pos, int depth, int alpha, int beta) {
        List<String> legal = pos.legalMoves();
        if (legal.isEmpty()) {
            // Checkmate (bad for side to move) or stalemate (0). Prefer faster mates.
            return pos.inCheck() ? -MATE + (SEARCH_DEPTH - depth) : 0;
        }
        String status = pos.status();
        if (!"ACTIVE".equals(status) && !"CHECKMATE".equals(status)) return 0;   // draw
        if (depth <= 0) return evaluate(pos);

        int best = -MATE - 1;
        for (String mv : ordered(pos, legal)) {
            ChessEngine next = pos.copy();
            next.applyUci(mv);
            int score = -negamax(next, depth - 1, -beta, -alpha);
            if (score > best) best = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;   // beta cut-off
        }
        return best;
    }

    /** Static evaluation from the side-to-move's perspective (centipawns). */
    private int evaluate(ChessEngine pos) {
        List<String> rows = pos.rows();
        int white = 0;
        for (int r = 0; r < 8; r++) {
            String row = rows.get(r);
            for (int c = 0; c < 8; c++) {
                char p = row.charAt(c);
                if (p == '.') continue;
                int[] pst = table(p);
                int sq = r * 8 + c;
                int val = pieceValue(p);
                if (Character.isUpperCase(p)) {
                    white += val + (pst != null ? pst[sq] : 0);
                } else {
                    // Black reads the table mirrored top-to-bottom.
                    int mirrored = (7 - r) * 8 + c;
                    white -= val + (pst != null ? pst[mirrored] : 0);
                }
            }
        }
        return pos.whiteToMove() ? white : -white;
    }

    /** Captures first — cheap move ordering that makes alpha-beta prune much more. */
    private List<String> ordered(ChessEngine pos, List<String> legal) {
        List<String> rows = pos.rows();
        List<String> captures = new ArrayList<>();
        List<String> quiet = new ArrayList<>();
        for (String mv : legal) {
            int tc = mv.charAt(2) - 'a', tr = 8 - (mv.charAt(3) - '0');
            char target = rows.get(tr).charAt(tc);
            if (target != '.') captures.add(mv); else quiet.add(mv);
        }
        Collections.shuffle(quiet, ThreadLocalRandom.current());   // vary equal-value play
        captures.addAll(quiet);
        return captures;
    }
}
