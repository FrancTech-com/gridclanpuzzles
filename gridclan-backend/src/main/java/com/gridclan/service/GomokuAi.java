package com.gridclan.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Heuristic Gomoku (five-in-a-row) opponent. No search tree — it scores every
 * candidate square by the line patterns it would create for itself (offense)
 * and deny the opponent (defense), and plays the best. Strong enough to be a
 * real challenge: it always completes a five, blocks an opponent's open four,
 * and prefers building open threes.
 *
 * Board is a 15×15 char grid: '.' empty, '1' player-one stone, '2' player-two.
 */
@Component
public class GomokuAi {

    private static final int SIZE = 15;
    private static final int[][] AXES = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };
    private final Random rng = new Random();

    /**
     * Difficulty-aware move: with probability {@code blunderChance} the computer
     * plays a deliberately weak (random) move instead of its best one, so easier
     * ladders are beatable. 0 = full strength (used for hints).
     */
    public int[] bestMove(char[][] b, char stone, char opp, double blunderChance) {
        if (blunderChance > 0 && rng.nextDouble() < blunderChance) {
            int[] weak = randomMove(b);
            if (weak != null) return weak;
        }
        return bestMove(b, stone, opp);
    }

    /** A random empty square — preferring one beside an existing stone, else any. */
    private int[] randomMove(char[][] b) {
        List<int[]> near = new ArrayList<>();
        List<int[]> any  = new ArrayList<>();
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (b[r][c] != '.') continue;
                any.add(new int[]{ r, c });
                if (hasNeighbor(b, r, c)) near.add(new int[]{ r, c });
            }
        }
        List<int[]> pool = !near.isEmpty() ? near : any;
        return pool.isEmpty() ? null : pool.get(rng.nextInt(pool.size()));
    }

    /**
     * Best square for `stone` to play, also weighing the value of blocking `opp`.
     * Returns {row, col}. Used both for the computer's move and for player hints.
     */
    public int[] bestMove(char[][] b, char stone, char opp) {
        if (isEmpty(b)) return new int[]{ SIZE / 2, SIZE / 2 };

        int[] best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (b[r][c] != '.' || !hasNeighbor(b, r, c)) continue;
                // Offense slightly outweighs defense, so a winning move is taken
                // over a block, but real threats are still answered.
                double score = eval(b, r, c, stone) * 1.0 + eval(b, r, c, opp) * 0.9;
                if (score > bestScore) { bestScore = score; best = new int[]{ r, c }; }
            }
        }
        return best != null ? best : anyEmpty(b);
    }

    /** Value of placing `stone` at (row,col): summed line potential over 4 axes. */
    private double eval(char[][] b, int row, int col, char stone) {
        double total = 0;
        for (int[] d : AXES) {
            int fwd  = run(b, row, col, d[0], d[1], stone);
            int back = run(b, row, col, -d[0], -d[1], stone);
            int len  = 1 + fwd + back;
            int open = (isEmptyAt(b, row + (fwd + 1) * d[0], col + (fwd + 1) * d[1]) ? 1 : 0)
                     + (isEmptyAt(b, row - (back + 1) * d[0], col - (back + 1) * d[1]) ? 1 : 0);
            total += lineValue(len, open);
        }
        return total;
    }

    /** Map a run length + number of open ends to a heuristic value. */
    private static double lineValue(int len, int openEnds) {
        if (len >= 5) return 10_000_000;                 // makes five — winning
        return switch (len) {
            case 4 -> openEnds == 2 ? 1_000_000 : openEnds == 1 ? 50_000 : 0;
            case 3 -> openEnds == 2 ? 50_000    : openEnds == 1 ? 1_000  : 0;
            case 2 -> openEnds == 2 ? 500       : openEnds == 1 ? 100    : 0;
            case 1 -> openEnds == 2 ? 50        : openEnds == 1 ? 10     : 0;
            default -> 0;
        };
    }

    private static int run(char[][] b, int row, int col, int dr, int dc, char stone) {
        int n = 0, r = row + dr, c = col + dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] == stone) { n++; r += dr; c += dc; }
        return n;
    }

    private static boolean isEmptyAt(char[][] b, int r, int c) {
        return r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] == '.';
    }

    /** Only consider squares within 2 of an existing stone — keeps it fast & sensible. */
    private static boolean hasNeighbor(char[][] b, int row, int col) {
        for (int dr = -2; dr <= 2; dr++) {
            for (int dc = -2; dc <= 2; dc++) {
                if (dr == 0 && dc == 0) continue;
                int r = row + dr, c = col + dc;
                if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r][c] != '.') return true;
            }
        }
        return false;
    }

    private static boolean isEmpty(char[][] b) {
        for (char[] row : b) for (char ch : row) if (ch != '.') return false;
        return true;
    }

    private static int[] anyEmpty(char[][] b) {
        for (int r = 0; r < SIZE; r++) for (int c = 0; c < SIZE; c++) if (b[r][c] == '.') return new int[]{ r, c };
        return new int[]{ SIZE / 2, SIZE / 2 };
    }
}
