package com.gridclan.gridscrabble;

/**
 * Grid Scrabble premium-square layout — the standard 15×15 board.
 *   T = triple word, D = double word, t = triple letter, d = double letter.
 * The centre star (7,7) is a double-word square where the first move must start.
 */
public final class Premiums {

    private Premiums() {}

    public enum Type { NONE, DOUBLE_LETTER, TRIPLE_LETTER, DOUBLE_WORD, TRIPLE_WORD }

    public static final int SIZE   = 15;
    public static final int CENTER = 7;

    // Canonical Scrabble layout (symmetric). One char per cell.
    private static final String[] MAP = {
        "T..d...T...d..T",
        ".D...t...t...D.",
        "..D...d.d...D..",
        "d..D...d...D..d",
        "....D.....D....",
        ".t...t...t...t.",
        "..d...d.d...d..",
        "T..d...D...d..T",
        "..d...d.d...d..",
        ".t...t...t...t.",
        "....D.....D....",
        "d..D...d...D..d",
        "..D...d.d...D..",
        ".D...t...t...D.",
        "T..d...T...d..T",
    };

    public static Type at(int row, int col) {
        if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return Type.NONE;
        switch (MAP[row].charAt(col)) {
            case 'T': return Type.TRIPLE_WORD;
            case 'D': return Type.DOUBLE_WORD;
            case 't': return Type.TRIPLE_LETTER;
            case 'd': return Type.DOUBLE_LETTER;
            default:  return Type.NONE;
        }
    }

    public static boolean isCenter(int row, int col) {
        return row == CENTER && col == CENTER;
    }
}
