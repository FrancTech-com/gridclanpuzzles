package com.gridclan.service;

import com.gridclan.entity.enums.GameType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Server-side hint engine.
 *
 * Hints are BLOCKED for COMMUNITY_TOURNAMENT sessions — enforced in
 * GameSessionService.requestHint() BEFORE this class is ever called.
 *
 * For allowed tiers: returns a hint for the next step. Points/gems are
 * deducted in the service layer before the hint is returned, so a disconnect
 * cannot grant a free hint.
 */
@Component
public class HintEngine {

    public Object compute(GameType type, Map<String, Object> boardState) {
        return switch (type) {
            case WORD_SEARCH -> hintWordSearch(boardState);
        };
    }

    /** Reveal the location of one not-yet-found word. */
    @SuppressWarnings("unchecked")
    private Object hintWordSearch(Map<String, Object> board) {
        List<String> grid  = (List<String>) board.get("grid");
        List<String> words = (List<String>) board.get("words");
        List<String> found = (List<String>) board.get("found");

        for (String word : words) {
            if (found.contains(word)) continue;
            int[] at = WordSearch.locate(grid, word);
            if (at != null) {
                return Map.of(
                    "type",    "WORD_LOCATION",
                    "word",    word,
                    "fromRow", at[0], "fromCol", at[1],
                    "toRow",   at[2], "toCol",   at[3],
                    "message", "Look for \"" + word + "\" here"
                );
            }
        }
        return Map.of("type", "NONE", "message", "You've found every word!");
    }
}
