package com.gridclan.service;

import com.gridclan.gridscrabble.MoveValidator;
import com.gridclan.gridscrabble.Placement;
import com.gridclan.gridscrabble.ScrabbleBoard;
import com.gridclan.gridscrabble.WordList;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Grid Scrabble opponent / hint generator.
 *
 * It proposes the highest-scoring legal move it can find for a given rack:
 *  • first move — words formable from the rack, played through the centre star;
 *  • later moves — words that hook through an existing board letter (the common,
 *    high-value play), aligned so board letters match and empty cells are filled
 *    from the rack (blanks act as wildcards).
 *
 * Crucially, EVERY candidate is checked by the authoritative {@link MoveValidator}
 * (which enforces connectivity, cross-words, the dictionary and scoring) before it
 * can be returned — so the AI can never make an illegal move. Returns null when no
 * legal move is found (the caller then passes/exchanges).
 *
 * It is not an optimal engine (it doesn't search non-overlapping "parallel" plays),
 * but it's a solid, fast opponent — and the same routine powers the player's hint.
 */
@Component
public class ScrabbleAi {

    private static final int SIZE     = ScrabbleBoard.SIZE;
    private static final int MAX_WORD = 10;        // cap word length the AI will attempt
    private static final int BLANK    = 26;        // index of the blank count in the rack array
    private static final int VALIDATE_CAP = 40_000; // safety bound on validations per move

    // Lazily built once from the dictionary.
    private volatile Map<Character, List<String>> byLetter;  // words grouped by each letter they contain
    private volatile List<String> rackWords;                 // length 2..7, for the opening move

    private void ensureIndex(WordList dict) {
        if (byLetter != null) return;
        synchronized (this) {
            if (byLetter != null) return;
            Map<Character, List<String>> idx = new HashMap<>();
            List<String> first = new ArrayList<>();
            for (String w : dict.all()) {
                int len = w.length();
                if (len < 2 || len > MAX_WORD) continue;
                if (len <= 7) first.add(w);
                boolean[] seen = new boolean[26];
                for (int i = 0; i < len; i++) {
                    int k = w.charAt(i) - 'A';
                    if (k >= 0 && k < 26 && !seen[k]) {
                        seen[k] = true;
                        idx.computeIfAbsent(w.charAt(i), x -> new ArrayList<>()).add(w);
                    }
                }
            }
            rackWords = first;
            byLetter = idx;
        }
    }

    /** Best legal move's placements (already validated), or null if none exists. */
    public List<Placement> bestMove(ScrabbleBoard board, String rack, WordList dict) {
        ensureIndex(dict);
        int[] counts = countRack(rack);
        Best best = new Best();

        if (board.isEmpty()) {
            for (String w : rackWords) {
                for (int i = 0; i < w.length(); i++) {
                    placeWord(board, counts, dict, w, 7, 7 - i, 0, 1, best);  // across through centre
                    placeWord(board, counts, dict, w, 7 - i, 7, 1, 0, best);  // down through centre
                    if (best.validations > VALIDATE_CAP) return best.placements;
                }
            }
            return best.placements;
        }

        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                if (!board.has(r, c)) continue;
                char x = Character.toUpperCase(board.get(r, c));
                List<String> words = byLetter.get(x);
                if (words == null) continue;
                for (String w : words) {
                    for (int i = 0; i < w.length(); i++) {
                        if (w.charAt(i) != x) continue;
                        // align word position i onto the board letter, both orientations
                        placeWord(board, counts, dict, w, r, c - i, 0, 1, best);
                        placeWord(board, counts, dict, w, r - i, c, 1, 0, best);
                    }
                    if (best.validations > VALIDATE_CAP) return best.placements;
                }
            }
        }
        return best.placements;
    }

    /**
     * Try laying `w` starting at (sr,sc) along (dr,dc): board letters must match,
     * empty cells are filled from the rack (blank = wildcard). Validates and keeps
     * the move if it's legal and beats the best so far.
     */
    private void placeWord(ScrabbleBoard board, int[] counts, WordList dict,
                           String w, int sr, int sc, int dr, int dc, Best best) {
        int len = w.length();
        int er = sr + (len - 1) * dr, ec = sc + (len - 1) * dc;
        if (!ScrabbleBoard.inBounds(sr, sc) || !ScrabbleBoard.inBounds(er, ec)) return;
        // Maximality: the word must not be extendable by an adjacent existing tile.
        if (board.has(sr - dr, sc - dc) || board.has(er + dr, ec + dc)) return;

        int[] cnt = counts.clone();
        List<Placement> pls = new ArrayList<>();
        for (int k = 0; k < len; k++) {
            int r = sr + k * dr, c = sc + k * dc;
            char need = w.charAt(k);
            if (board.has(r, c)) {
                if (Character.toUpperCase(board.get(r, c)) != need) return;   // clashes with the board
            } else {
                int idx = need - 'A';
                if (idx >= 0 && idx < 26 && cnt[idx] > 0) {
                    cnt[idx]--;
                    pls.add(new Placement(r, c, need, false));
                } else if (cnt[BLANK] > 0) {
                    cnt[BLANK]--;
                    pls.add(new Placement(r, c, need, true));
                } else {
                    return;   // rack can't supply this tile
                }
            }
        }
        if (pls.isEmpty()) return;   // must place at least one new tile

        best.validations++;
        MoveValidator.Result res = MoveValidator.validate(board, pls, dict);
        if (res.valid() && res.score() > best.score) {
            best.score = res.score();
            best.placements = pls;
        }
    }

    private static int[] countRack(String rack) {
        int[] counts = new int[27];
        if (rack != null) {
            for (char ch : rack.toCharArray()) {
                if (ch == '_') counts[BLANK]++;
                else {
                    int k = Character.toUpperCase(ch) - 'A';
                    if (k >= 0 && k < 26) counts[k]++;
                }
            }
        }
        return counts;
    }

    private static final class Best {
        int score = -1;
        int validations = 0;
        List<Placement> placements = null;
    }
}
