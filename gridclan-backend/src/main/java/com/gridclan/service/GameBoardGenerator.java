package com.gridclan.service;

import com.gridclan.entity.enums.GameType;
import lombok.Getter;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Random;

/**
 * Server-side board generator and move applicator.
 *
 * Generates the initial authoritative board state for each game type,
 * and applies validated moves to produce the next board state.
 *
 * CLIENT NEVER TOUCHES THIS LOGIC. The board is generated here,
 * sent to the client as a display payload, and replaced entirely
 * after each confirmed move.
 */
@Component
public class GameBoardGenerator {

    private final Random rng = new Random();

    // ── Board Generation ───────────────────────────────────────────────────

    public Map<String, Object> generate(GameType type) {
        return switch (type) {
            case WORD_SEARCH -> WordSearch.generate(rng);
        };
    }

    // ── Move Application ───────────────────────────────────────────────────

    public MoveResult applyMove(GameType type, Map<String, Object> board, Object move) {
        return switch (type) {
            case WORD_SEARCH -> WordSearch.applyMove(board, move);
        };
    }

    // ── Inner result wrapper ───────────────────────────────────────────────

    @Getter
    public static class MoveResult {
        private final Map<String, Object> state;
        private final boolean solved;

        public MoveResult(Map<String, Object> state, boolean solved) {
            this.state  = state;
            this.solved = solved;
        }
    }
}
