package com.gridclan.anticheat;

import com.gridclan.service.WordSearch;

/**
 * WordSearchValidator
 *
 * Structural legality only: a move must be a straight line (horizontal, vertical,
 * or diagonal) that stays inside the grid. Selecting a line that doesn't spell a
 * listed word is NORMAL gameplay (a wrong guess), not cheating — that's decided
 * later in WordSearch.applyMove and simply doesn't mark a word. The anti-cheat
 * gate only rejects geometrically impossible selections.
 */
class WordSearchValidator {

    static boolean isLegalMove(Object boardState, Object move) {
        return WordSearch.isLegalLine(boardState, move);
    }
}
