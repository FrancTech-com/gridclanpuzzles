package com.gridclan.gridscrabble;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * The shared tile bag for a Grid Scrabble game. Server-authoritative: the bag
 * is built and shuffled from a seed so a game is fully reproducible/auditable
 * (anti-cheat) and never depends on client-supplied tiles.
 *
 * Not thread-safe; a game's turns are processed serially on the server.
 */
public final class TileBag {

    public static final int RACK_SIZE = 7;

    private final List<Character> tiles = new ArrayList<>();

    /** Build a full bag (100 tiles) shuffled deterministically from {@code seed}. */
    public TileBag(long seed) {
        for (Map.Entry<Character, Integer> e : Letters.DISTRIBUTION.entrySet()) {
            for (int i = 0; i < e.getValue(); i++) tiles.add(e.getKey());
        }
        Collections.shuffle(tiles, new Random(seed));
    }

    /** Reconstruct a bag from a known remaining-tiles list (rehydrate game state). */
    public TileBag(List<Character> remaining) {
        tiles.addAll(remaining);
    }

    public int remaining() { return tiles.size(); }

    public boolean isEmpty() { return tiles.isEmpty(); }

    /** Draw up to {@code n} tiles (fewer if the bag runs low). */
    public List<Character> draw(int n) {
        List<Character> out = new ArrayList<>(Math.min(n, tiles.size()));
        for (int i = 0; i < n && !tiles.isEmpty(); i++) {
            out.add(tiles.remove(tiles.size() - 1));
        }
        return out;
    }

    /**
     * Exchange: return tiles to the bag and draw the same number back. Only
     * allowed (by rule) when the bag still has at least RACK_SIZE tiles — the
     * caller enforces that. Returns the freshly drawn tiles.
     */
    public List<Character> exchange(List<Character> returned) {
        List<Character> fresh = draw(returned.size());
        tiles.addAll(returned);
        Collections.shuffle(tiles, new Random());
        return fresh;
    }

    /** Current contents (for persisting game state). */
    public List<Character> snapshot() { return new ArrayList<>(tiles); }
}
