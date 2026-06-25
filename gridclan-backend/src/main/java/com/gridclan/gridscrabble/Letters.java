package com.gridclan.gridscrabble;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Grid Scrabble letter values and tile distribution — standard English Scrabble
 * set (98 letter tiles + 2 blanks = 100). Blanks ('_') are wildcards worth 0.
 *
 * Pure data/logic; no game state. Server-authoritative scoring builds on this.
 */
public final class Letters {

    private Letters() {}

    /** Wildcard tile. When played it represents a letter but always scores 0. */
    public static final char BLANK = '_';

    public static final Map<Character, Integer> VALUE;
    public static final Map<Character, Integer> DISTRIBUTION;

    static {
        Map<Character, Integer> v = new HashMap<>();
        for (char c : "AEIOULNSTR".toCharArray()) v.put(c, 1);
        for (char c : "DG".toCharArray())         v.put(c, 2);
        for (char c : "BCMP".toCharArray())       v.put(c, 3);
        for (char c : "FHVWY".toCharArray())      v.put(c, 4);
        v.put('K', 5);
        for (char c : "JX".toCharArray())         v.put(c, 8);
        for (char c : "QZ".toCharArray())         v.put(c, 10);
        v.put(BLANK, 0);
        VALUE = Collections.unmodifiableMap(v);

        // Standard English distribution (counts).
        Map<Character, Integer> d = new LinkedHashMap<>();
        put(d, 'A', 9); put(d, 'B', 2); put(d, 'C', 2); put(d, 'D', 4); put(d, 'E', 12);
        put(d, 'F', 2); put(d, 'G', 3); put(d, 'H', 2); put(d, 'I', 9); put(d, 'J', 1);
        put(d, 'K', 1); put(d, 'L', 4); put(d, 'M', 2); put(d, 'N', 6); put(d, 'O', 8);
        put(d, 'P', 2); put(d, 'Q', 1); put(d, 'R', 6); put(d, 'S', 4); put(d, 'T', 6);
        put(d, 'U', 4); put(d, 'V', 2); put(d, 'W', 2); put(d, 'X', 1); put(d, 'Y', 2);
        put(d, 'Z', 1); put(d, BLANK, 2);
        DISTRIBUTION = Collections.unmodifiableMap(d);
    }

    private static void put(Map<Character, Integer> m, char c, int n) { m.put(c, n); }

    /** Face value of a tile. A blank (or any unknown char) scores 0. */
    public static int value(char tile) {
        return VALUE.getOrDefault(Character.toUpperCase(tile), 0);
    }

    /** Total tiles in a fresh bag (100 for the standard set). */
    public static int totalTiles() {
        return DISTRIBUTION.values().stream().mapToInt(Integer::intValue).sum();
    }
}
