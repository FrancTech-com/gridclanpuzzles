package com.gridclan.gridscrabble;

/**
 * One tile a player puts down this turn.
 * `letter` is the represented letter (for a blank, the letter the player chose);
 * `blank` = true means it was a blank tile, so it scores 0.
 */
public record Placement(int row, int col, char letter, boolean blank) {
    public char upper() { return Character.toUpperCase(letter); }
}
