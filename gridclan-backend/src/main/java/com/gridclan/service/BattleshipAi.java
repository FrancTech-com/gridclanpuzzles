package com.gridclan.service;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * Battleship targeting AI — the classic "hunt / target" strategy.
 *
 * Operating on the board it is firing at ('S' = unhit ship, 'X' = our hit,
 * 'O' = our miss, '.' = unhit water):
 *   • TARGET mode — if there are hits that aren't part of a finished line, fire
 *     adjacent to them; once two hits line up, extend along that line.
 *   • HUNT mode — otherwise fire on a checkerboard parity (no ship smaller than
 *     2 can hide between parity cells), which finds ships far faster than random.
 */
@Component
public class BattleshipAi {

    private static final int SIZE = 10;
    private final SecureRandom rnd = new SecureRandom();

    /**
     * Difficulty-aware shot: with probability {@code blunderChance} the computer
     * fires at a random untried cell instead of its hunt/target choice, so easier
     * ladders are beatable. 0 = full strength.
     */
    public int[] nextTarget(char[][] b, double blunderChance) {
        if (blunderChance > 0 && rnd.nextDouble() < blunderChance) {
            List<int[]> any = new ArrayList<>();
            for (int r = 0; r < SIZE; r++) {
                for (int c = 0; c < SIZE; c++) {
                    if (untried(b[r][c])) any.add(new int[]{ r, c });
                }
            }
            if (!any.isEmpty()) return any.get(rnd.nextInt(any.size()));
        }
        return nextTarget(b);
    }

    /** Next cell {row,col} to fire at. */
    public int[] nextTarget(char[][] b) {
        List<int[]> targets = targetCandidates(b);
        if (!targets.isEmpty()) return targets.get(rnd.nextInt(targets.size()));

        List<int[]> parity = new ArrayList<>();
        List<int[]> any = new ArrayList<>();
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (!untried(b[r][c])) continue;
                any.add(new int[]{ r, c });
                if (((r + c) & 1) == 0) parity.add(new int[]{ r, c });
            }
        }
        List<int[]> pool = parity.isEmpty() ? any : parity;
        return pool.get(rnd.nextInt(pool.size()));
    }

    /** Cells worth firing at because they neighbour an existing hit. */
    private List<int[]> targetCandidates(char[][] b) {
        // Prefer extending a line of two or more aligned hits.
        List<int[]> line = new ArrayList<>();
        int[][] axes = { {0, 1}, {1, 0} };
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (b[r][c] != 'X') continue;
                for (int[] d : axes) {
                    int nr = r + d[0], nc = c + d[1];
                    if (inBounds(nr, nc) && b[nr][nc] == 'X') {
                        addExtension(b, r, c, -d[0], -d[1], line);   // beyond one end
                        addExtension(b, r, c,  d[0],  d[1], line);   // beyond the other
                    }
                }
            }
        }
        if (!line.isEmpty()) return line;

        // Otherwise any untried orthogonal neighbour of a single hit.
        List<int[]> nb = new ArrayList<>();
        int[][] dirs = { {0, 1}, {0, -1}, {1, 0}, {-1, 0} };
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (b[r][c] != 'X') continue;
                for (int[] d : dirs) {
                    int nr = r + d[0], nc = c + d[1];
                    if (inBounds(nr, nc) && untried(b[nr][nc])) nb.add(new int[]{ nr, nc });
                }
            }
        }
        return nb;
    }

    /** Walk past the run of hits from (r,c) along (dr,dc); add the first untried cell. */
    private void addExtension(char[][] b, int r, int c, int dr, int dc, List<int[]> out) {
        int nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && b[nr][nc] == 'X') { nr += dr; nc += dc; }
        if (inBounds(nr, nc) && untried(b[nr][nc])) out.add(new int[]{ nr, nc });
    }

    private static boolean untried(char ch) { return ch == 'S' || ch == '.'; }
    private static boolean inBounds(int r, int c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
}
