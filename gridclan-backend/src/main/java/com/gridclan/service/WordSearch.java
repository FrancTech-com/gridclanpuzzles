package com.gridclan.service;

import java.util.*;

/**
 * Word Search — solo, server-authoritative game logic.
 *
 * The board is a grid of letters with a list of words hidden in straight lines
 * (horizontal, vertical, or diagonal — forwards or backwards). The player selects
 * a line of cells; the server reads the actual grid letters along that line and
 * checks them against the word list. The answer coordinates are NEVER stored in or
 * sent with the board state — the server re-scans the grid when it needs them
 * (find-matching and hints), so the client can't cheat by reading the payload.
 *
 * Board state shape (a plain Map, JSON-friendly):
 *   type   : "WORD_SEARCH"
 *   rows   : int
 *   cols   : int
 *   grid   : List<String>   — one uppercase-letter string per row
 *   words  : List<String>   — the words to find (shown to the player)
 *   found  : List<String>   — words found so far (starts empty)
 *   solved : boolean
 *
 * Move shape: { fromRow, fromCol, toRow, toCol }
 */
public final class WordSearch {

    private WordSearch() {}

    static final int   GRID_SIZE   = 10;
    static final int   TARGET_WORDS = 8;
    private static final int PLACE_ATTEMPTS = 60;

    /** 8 directions: N, NE, E, SE, S, SW, W, NW. */
    private static final int[][] DIRS = {
        {-1, 0}, {-1, 1}, {0, 1}, {1, 1}, {1, 0}, {1, -1}, {0, -1}, {-1, -1}
    };

    /**
     * Common 4–8 letter words across many everyday themes (animals, food, nature,
     * objects…). A large, varied pool so each puzzle draws a fresh-feeling set of
     * words — no external dictionary needed for placement.
     */
    private static final List<String> WORD_POOL = List.of(
        // Puzzle/game flavour
        "PUZZLE", "PLAYER", "WINNER", "POINTS", "STREAK", "RIDDLE", "MASTER", "ARENA",
        // Animals
        "TIGER", "ZEBRA", "EAGLE", "HORSE", "MOUSE", "SHARK", "WHALE", "PANDA",
        "KOALA", "OTTER", "RABBIT", "MONKEY", "TURTLE", "FALCON", "DONKEY", "BEAVER",
        "JAGUAR", "LIZARD", "PARROT", "WALRUS", "PENGUIN", "DOLPHIN", "GIRAFFE", "ROOSTER",
        // Food
        "APPLE", "BREAD", "MANGO", "LEMON", "GRAPE", "PEACH", "ONION", "CARROT",
        "POTATO", "BANANA", "ORANGE", "CHEESE", "TOMATO", "PEPPER", "COOKIE", "HONEY",
        "OLIVE", "CHERRY", "WALNUT", "BISCUIT", "MUFFIN", "YOGURT",
        // Nature
        "RIVER", "OCEAN", "BEACH", "CLOUD", "STORM", "PLANT", "FOREST", "FLOWER",
        "MEADOW", "DESERT", "ISLAND", "JUNGLE", "VALLEY", "CANYON", "BREEZE", "GARDEN",
        "SUNSET", "PEBBLE", "THUNDER", "RAINBOW",
        // Objects / home
        "TABLE", "CHAIR", "CLOCK", "PHONE", "BRUSH", "SPOON", "PLATE", "MIRROR",
        "CANDLE", "PILLOW", "BASKET", "WINDOW", "PENCIL", "WALLET", "HAMMER", "LADDER",
        "BOTTLE", "BLANKET", "TEAPOT", "BUTTON",
        // Everyday / misc
        "MUSIC", "DANCE", "DREAM", "SMILE", "BRAVE", "PEACE", "LIGHT", "NIGHT",
        "STORY", "MAGIC", "CANDY", "TRAIN", "PLANE", "FRIEND", "FAMILY", "SUMMER",
        "WINTER", "SPRING", "AUTUMN", "COFFEE", "GUITAR", "CAMERA", "JACKET", "ANCHOR",
        "BRIDGE", "CASTLE", "MARKET", "PLANET", "GALAXY", "COMET", "ROCKET", "JOURNEY"
    );

    // ── Generation ───────────────────────────────────────────────────────────

    public static Map<String, Object> generate(Random rng) {
        int n = GRID_SIZE;
        char[][] grid = new char[n][n];
        for (char[] row : grid) Arrays.fill(row, '\0');

        List<String> pool = new ArrayList<>(WORD_POOL);
        Collections.shuffle(pool, rng);

        List<String> placed = new ArrayList<>();
        for (String word : pool) {
            if (placed.size() >= TARGET_WORDS) break;
            if (word.length() > n) continue;
            if (tryPlace(grid, word, rng)) placed.add(word);
        }

        // Fill the gaps with random letters.
        for (int r = 0; r < n; r++) {
            for (int c = 0; c < n; c++) {
                if (grid[r][c] == '\0') grid[r][c] = (char) ('A' + rng.nextInt(26));
            }
        }

        List<String> rows = new ArrayList<>(n);
        for (int r = 0; r < n; r++) rows.add(new String(grid[r]));

        Map<String, Object> board = new LinkedHashMap<>();
        board.put("type",   "WORD_SEARCH");
        board.put("rows",   n);
        board.put("cols",   n);
        board.put("grid",   rows);
        board.put("words",  placed);
        board.put("found",  new ArrayList<String>());
        board.put("solved", false);
        return board;
    }

    private static boolean tryPlace(char[][] grid, String word, Random rng) {
        int n = grid.length;
        for (int attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
            int[] dir = DIRS[rng.nextInt(DIRS.length)];
            int len = word.length();
            int endR = (len - 1) * dir[0];
            int endC = (len - 1) * dir[1];
            // Choose a start so the whole word stays in bounds.
            int rLow = Math.max(0, -endR), rHigh = n - Math.max(0, endR);
            int cLow = Math.max(0, -endC), cHigh = n - Math.max(0, endC);
            if (rLow >= rHigh || cLow >= cHigh) continue;
            int r = rLow + rng.nextInt(rHigh - rLow);
            int c = cLow + rng.nextInt(cHigh - cLow);

            boolean fits = true;
            for (int i = 0; i < len; i++) {
                char existing = grid[r + i * dir[0]][c + i * dir[1]];
                if (existing != '\0' && existing != word.charAt(i)) { fits = false; break; }
            }
            if (!fits) continue;
            for (int i = 0; i < len; i++) grid[r + i * dir[0]][c + i * dir[1]] = word.charAt(i);
            return true;
        }
        return false;
    }

    // ── Move application ─────────────────────────────────────────────────────

    /** Apply a selection. If it spells an unfound word, mark it found. Otherwise a harmless no-op. */
    @SuppressWarnings("unchecked")
    public static GameBoardGenerator.MoveResult applyMove(Map<String, Object> board, Object moveObj) {
        Map<String, Object> next = copy(board);
        List<String> grid  = (List<String>) next.get("grid");
        List<String> words = (List<String>) next.get("words");
        List<String> found = new ArrayList<>((List<String>) next.get("found"));

        String matched = matchWord(grid, words, found, moveObj);
        if (matched != null) found.add(matched);

        next.put("found", found);
        boolean solved = found.size() >= words.size();
        next.put("solved", solved);
        return new GameBoardGenerator.MoveResult(next, solved);
    }

    // ── Validation helpers (shared with anti-cheat) ───────────────────────────

    /** A structurally legal move is a straight line (H/V/diagonal) fully in bounds. */
    @SuppressWarnings("unchecked")
    public static boolean isLegalLine(Object boardState, Object moveObj) {
        try {
            Map<String, Object> board = (Map<String, Object>) boardState;
            List<String> grid = (List<String>) board.get("grid");
            return cells(grid, moveObj) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** The unfound word this selection spells (forwards or backwards), or null. */
    public static String matchWord(List<String> grid, List<String> words,
                                   Collection<String> found, Object moveObj) {
        List<int[]> path = cells(grid, moveObj);
        if (path == null) return null;
        StringBuilder sb = new StringBuilder(path.size());
        for (int[] cell : path) sb.append(grid.get(cell[0]).charAt(cell[1]));
        String fwd = sb.toString();
        String rev = sb.reverse().toString();
        for (String w : words) {
            if (found.contains(w)) continue;
            if (w.equals(fwd) || w.equals(rev)) return w;
        }
        return null;
    }

    /** Locate a word in the grid for a hint → [fromRow, fromCol, toRow, toCol], or null. */
    public static int[] locate(List<String> grid, String word) {
        int rows = grid.size(), cols = grid.get(0).length(), len = word.length();
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                for (int[] dir : DIRS) {
                    int endR = r + (len - 1) * dir[0];
                    int endC = c + (len - 1) * dir[1];
                    if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;
                    boolean hit = true;
                    for (int i = 0; i < len; i++) {
                        if (grid.get(r + i * dir[0]).charAt(c + i * dir[1]) != word.charAt(i)) {
                            hit = false; break;
                        }
                    }
                    if (hit) return new int[]{ r, c, endR, endC };
                }
            }
        }
        return null;
    }

    // ── Internals ────────────────────────────────────────────────────────────

    /** The cells of a straight-line selection, or null if it isn't one / is out of bounds. */
    @SuppressWarnings("unchecked")
    private static List<int[]> cells(List<String> grid, Object moveObj) {
        Map<String, Object> m = (Map<String, Object>) moveObj;
        int fromRow = intval(m.get("fromRow")), fromCol = intval(m.get("fromCol"));
        int toRow   = intval(m.get("toRow")),   toCol   = intval(m.get("toCol"));

        int rows = grid.size(), cols = grid.get(0).length();
        if (!inBounds(rows, cols, fromRow, fromCol) || !inBounds(rows, cols, toRow, toCol)) return null;

        int dr = Integer.signum(toRow - fromRow), dc = Integer.signum(toCol - fromCol);
        int rowLen = Math.abs(toRow - fromRow), colLen = Math.abs(toCol - fromCol);
        // Must be horizontal, vertical, or a 45° diagonal.
        if (!(rowLen == 0 || colLen == 0 || rowLen == colLen)) return null;

        int steps = Math.max(rowLen, colLen);
        List<int[]> path = new ArrayList<>(steps + 1);
        for (int i = 0; i <= steps; i++) path.add(new int[]{ fromRow + i * dr, fromCol + i * dc });
        return path;
    }

    private static boolean inBounds(int rows, int cols, int r, int c) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    private static int intval(Object o) {
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(String.valueOf(o));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> copy(Map<String, Object> board) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : board.entrySet()) {
            Object v = e.getValue();
            out.put(e.getKey(), v instanceof List ? new ArrayList<>((List<Object>) v) : v);
        }
        return out;
    }
}
