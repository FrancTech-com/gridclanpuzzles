package com.gridclan.gridscrabble;

/**
 * Grid Scrabble board state — the placed tiles on the 15×15 grid.
 *
 * `grid[r][c]` is the (upper-case) letter at a cell, or 0 if empty.
 * `blank[r][c]` marks a cell filled by a blank tile (scores 0 even though it
 * displays a letter). Pure state; move legality/scoring live in MoveValidator.
 */
public final class ScrabbleBoard {

    public static final int SIZE = Premiums.SIZE;

    private final char[][] grid = new char[SIZE][SIZE];
    private final boolean[][] blank = new boolean[SIZE][SIZE];

    public static boolean inBounds(int r, int c) {
        return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
    }

    public boolean isEmpty() {
        for (char[] row : grid) for (char ch : row) if (ch != 0) return false;
        return true;
    }

    public boolean has(int r, int c)  { return inBounds(r, c) && grid[r][c] != 0; }
    public char    get(int r, int c)  { return inBounds(r, c) ? grid[r][c] : 0; }
    public boolean isBlank(int r, int c) { return inBounds(r, c) && blank[r][c]; }

    /** Commit a tile (used when applying an already-validated move). */
    public void place(int r, int c, char letter, boolean isBlank) {
        grid[r][c]  = Character.toUpperCase(letter);
        blank[r][c] = isBlank;
    }
}
