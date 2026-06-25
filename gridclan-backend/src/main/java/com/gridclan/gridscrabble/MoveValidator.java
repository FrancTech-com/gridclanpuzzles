package com.gridclan.gridscrabble;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Server-authoritative Grid Scrabble move resolution: validates a set of newly
 * placed tiles against the current board and rules, and computes the score.
 *
 * Rules enforced:
 *  - tiles in bounds, on empty cells, no duplicates;
 *  - all in a single row or column, forming one contiguous run (gaps may be
 *    filled by existing tiles);
 *  - first move covers the centre and is ≥ 2 letters;
 *  - later moves connect to existing tiles;
 *  - the main word and every cross-word must be in the dictionary;
 *  - score: letter premiums (DL/TL) and word premiums (DW/TW) apply only to
 *    newly covered squares; +50 bingo bonus for using all 7 tiles.
 */
public final class MoveValidator {

    private MoveValidator() {}

    /** Result of resolving a move: either valid (with score + words) or rejected. */
    public record Result(boolean valid, String reason, int score, List<String> words) {
        static Result reject(String reason) { return new Result(false, reason, 0, List.of()); }
        static Result ok(int score, List<String> words) { return new Result(true, null, score, words); }
    }

    public static Result validate(ScrabbleBoard board, List<Placement> placements, WordList dict) {
        if (placements == null || placements.isEmpty()) return Result.reject("No tiles placed.");
        if (placements.size() > TileBag.RACK_SIZE) return Result.reject("Too many tiles.");

        // Overlay for quick "tile at (r,c)" lookups including this turn's tiles.
        Map<Long, Placement> placed = new HashMap<>();
        for (Placement p : placements) {
            if (!ScrabbleBoard.inBounds(p.row(), p.col())) return Result.reject("Tile off the board.");
            if (board.has(p.row(), p.col()))               return Result.reject("Cell already occupied.");
            if (placed.put(key(p.row(), p.col()), p) != null) return Result.reject("Two tiles on one cell.");
        }

        boolean sameRow = placements.stream().allMatch(p -> p.row() == placements.get(0).row());
        boolean sameCol = placements.stream().allMatch(p -> p.col() == placements.get(0).col());
        if (!sameRow && !sameCol) return Result.reject("Tiles must be in one line.");

        // Contiguity along the main line (no holes between first and last new tile).
        int line, min, max;
        if (sameRow) {
            line = placements.get(0).row();
            min = placements.stream().mapToInt(Placement::col).min().getAsInt();
            max = placements.stream().mapToInt(Placement::col).max().getAsInt();
            for (int c = min; c <= max; c++) if (!occupied(board, placed, line, c)) return Result.reject("Gap in the word.");
        } else {
            line = placements.get(0).col();
            min = placements.stream().mapToInt(Placement::row).min().getAsInt();
            max = placements.stream().mapToInt(Placement::row).max().getAsInt();
            for (int r = min; r <= max; r++) if (!occupied(board, placed, r, line)) return Result.reject("Gap in the word.");
        }

        boolean firstMove = board.isEmpty();
        if (firstMove) {
            boolean coversCentre = placements.stream()
                .anyMatch(p -> Premiums.isCenter(p.row(), p.col()));
            if (!coversCentre) return Result.reject("First word must cross the centre star.");
        } else if (!connects(board, placements)) {
            return Result.reject("New tiles must connect to existing tiles.");
        }

        // Collect words: main line (length ≥ 2) + each perpendicular cross-word.
        List<int[][]> words = new ArrayList<>();
        int[][] main = sameRow
            ? wordCells(board, placed, line, min, 0, 1)
            : wordCells(board, placed, min, line, 1, 0);
        if (main.length >= 2) words.add(main);

        for (Placement p : placements) {
            int[][] cross = sameRow
                ? wordCells(board, placed, p.row(), p.col(), 1, 0)   // vertical through a horizontal move
                : wordCells(board, placed, p.row(), p.col(), 0, 1);  // horizontal through a vertical move
            if (cross.length >= 2) words.add(cross);
        }

        if (words.isEmpty()) return Result.reject("A word must be at least two letters.");

        // Validate every word against the dictionary, and score.
        int total = 0;
        List<String> wordStrings = new ArrayList<>();
        for (int[][] cells : words) {
            String w = wordString(board, placed, cells);
            if (!dict.contains(w)) return Result.reject("Not a valid word: " + w);
            wordStrings.add(w);
            total += scoreWord(board, placed, cells);
        }
        if (placements.size() == TileBag.RACK_SIZE) total += 50; // bingo

        return Result.ok(total, wordStrings);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static boolean occupied(ScrabbleBoard b, Map<Long, Placement> placed, int r, int c) {
        return b.has(r, c) || placed.containsKey(key(r, c));
    }

    private static boolean connects(ScrabbleBoard b, List<Placement> placements) {
        for (Placement p : placements) {
            if (b.has(p.row() - 1, p.col()) || b.has(p.row() + 1, p.col())
             || b.has(p.row(), p.col() - 1) || b.has(p.row(), p.col() + 1)) return true;
        }
        return false;
    }

    /** Cells of the full word through (r,c) in direction (dr,dc): walk back to start, then forward. */
    private static int[][] wordCells(ScrabbleBoard b, Map<Long, Placement> placed, int r, int c, int dr, int dc) {
        int sr = r, sc = c;
        while (occupied(b, placed, sr - dr, sc - dc)) { sr -= dr; sc -= dc; }
        List<int[]> cells = new ArrayList<>();
        int cr = sr, cc = sc;
        while (occupied(b, placed, cr, cc)) { cells.add(new int[]{cr, cc}); cr += dr; cc += dc; }
        return cells.toArray(new int[0][]);
    }

    private static char letterAt(ScrabbleBoard b, Map<Long, Placement> placed, int r, int c) {
        Placement p = placed.get(key(r, c));
        return p != null ? p.upper() : b.get(r, c);
    }

    private static boolean blankAt(ScrabbleBoard b, Map<Long, Placement> placed, int r, int c) {
        Placement p = placed.get(key(r, c));
        return p != null ? p.blank() : b.isBlank(r, c);
    }

    private static String wordString(ScrabbleBoard b, Map<Long, Placement> placed, int[][] cells) {
        StringBuilder sb = new StringBuilder(cells.length);
        for (int[] cell : cells) sb.append(letterAt(b, placed, cell[0], cell[1]));
        return sb.toString();
    }

    private static int scoreWord(ScrabbleBoard b, Map<Long, Placement> placed, int[][] cells) {
        int sum = 0, wordMult = 1;
        for (int[] cell : cells) {
            int r = cell[0], col = cell[1];
            int v = blankAt(b, placed, r, col) ? 0 : Letters.value(letterAt(b, placed, r, col));
            boolean isNew = placed.containsKey(key(r, col));
            if (isNew) {
                switch (Premiums.at(r, col)) {
                    case DOUBLE_LETTER -> v *= 2;
                    case TRIPLE_LETTER -> v *= 3;
                    case DOUBLE_WORD   -> wordMult *= 2;
                    case TRIPLE_WORD   -> wordMult *= 3;
                    default -> { }
                }
            }
            sum += v;
        }
        return sum * wordMult;
    }

    private static long key(int r, int c) { return (long) r * ScrabbleBoard.SIZE + c; }
}
