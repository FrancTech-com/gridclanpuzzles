package com.gridclan.service;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameType;
import com.gridclan.gridscrabble.WordList;
import lombok.Getter;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
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

    // Word-search words are drawn from the bundled dictionary (length 4–8), built
    // once on first use — endless variety with no hardcoded list. Falls back to
    // WordSearch's built-in pool if the dictionary resource is missing.
    private volatile List<String> wordSearchPool;

    private List<String> wordSearchPool() {
        List<String> p = wordSearchPool;
        if (p == null) {
            synchronized (this) {
                if ((p = wordSearchPool) == null) {
                    List<String> list = new ArrayList<>();
                    for (String w : WordList.fromResource().all()) {
                        int len = w.length();
                        if (len >= 4 && len <= 8 && w.chars().allMatch(ch -> ch >= 'A' && ch <= 'Z')) {
                            list.add(w);
                        }
                    }
                    wordSearchPool = p = list;
                }
            }
        }
        return p;
    }

    // ── Board Generation ───────────────────────────────────────────────────

    public Map<String, Object> generate(GameType type) {
        return switch (type) {
            case WORD_SEARCH -> WordSearch.generate(rng, wordSearchPool());
        };
    }

    /**
     * Difficulty/level-aware board generation for solo ladder play. The grid size,
     * word count, and which directions words may be hidden in are all derived from
     * {@code difficulty} + {@code level} (see {@link Difficulty}).
     */
    public Map<String, Object> generate(GameType type, Difficulty difficulty, int level) {
        if (difficulty == null) return generate(type);
        return switch (type) {
            case WORD_SEARCH -> WordSearch.generate(
                rng, wordSearchPool(),
                difficulty.gridSizeFor(level), difficulty.wordCountFor(level),
                difficulty.allowDiagonal(), difficulty.allowReverse());
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
