package com.gridclan.service;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameType;
import org.springframework.stereotype.Component;

/**
 * Server-side authoritative score engine.
 *
 * Score is ONLY ever computed here — never on the client.
 * MoveResponse always replaces client score with the server value.
 *
 * Scoring model:
 *   Base score per game type, minus a penalty for each extra move used.
 *   Bonus awarded on solve within the "par" move count.
 *   For ladder (solo difficulty) sessions the result is then multiplied by the
 *   difficulty+level multiplier, so Hard/late levels pay far more than Easy/early
 *   ones. Non-ladder sessions (difficulty == null) use a ×1 multiplier.
 */
@Component
public class ScoreEngine {

    private static final int WORD_SEARCH_BASE   = 1000;

    private static final int MOVE_PENALTY       = 10;  // Points lost per move over par
    private static final int SPEED_BONUS        = 50;  // Bonus for solving under par

    // "Par" move counts per game type. Word Search has ~8 words; allow a couple of
    // mistaken selections before the speed bonus is forfeited.
    private static final int WORD_SEARCH_PAR    = 10;

    /**
     * Calculate the current score given game type, moves used, and whether solved.
     * Called after every move — client receives and displays the result.
     *
     * @param type      game type
     * @param moveCount total moves made so far (including this move)
     * @param solved    whether the puzzle is solved after this move
     */
    public int calculate(GameType type, int moveCount, boolean solved) {
        return calculate(type, moveCount, solved, null, 0);
    }

    /**
     * As {@link #calculate(GameType, int, boolean)}, but scaled for a difficulty
     * ladder session. {@code difficulty == null} means a non-ladder session (×1).
     */
    public int calculate(GameType type, int moveCount, boolean solved,
                         Difficulty difficulty, int level) {
        int base = switch (type) {
            case WORD_SEARCH -> WORD_SEARCH_BASE;
        };
        int par = switch (type) {
            case WORD_SEARCH -> WORD_SEARCH_PAR;
        };

        int score = base - (Math.max(0, moveCount - 1) * MOVE_PENALTY);
        if (solved && moveCount <= par) score += SPEED_BONUS;
        score = Math.max(0, score);

        if (difficulty != null) {
            score = (int) Math.round(score * difficulty.pointsMultiplierFor(level));
        }
        return score;
    }
}
