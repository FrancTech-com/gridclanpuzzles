package com.gridclan.gridscrabble;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * The dictionary of legal Grid Scrabble words.
 *
 * Loads an upper-case word list from the classpath resource
 * `gridscrabble/words.txt` (one word per line) when present; otherwise starts
 * empty. A full open/public-domain list is bundled separately — the validator
 * only needs membership lookup, so the source list is swappable.
 */
public final class WordList {

    private final Set<String> words;

    public WordList(Set<String> words) {
        this.words = words;
    }

    public boolean contains(String word) {
        return word != null && words.contains(word.toUpperCase());
    }

    public int size() { return words.size(); }

    /** Read-only view of every word — used by the AI to build its move index. */
    public Set<String> all() { return java.util.Collections.unmodifiableSet(words); }

    /** Load from the bundled resource (empty set if the file is absent). */
    public static WordList fromResource() {
        Set<String> set = new HashSet<>();
        try (InputStream in = WordList.class.getClassLoader()
                .getResourceAsStream("gridscrabble/words.txt")) {
            if (in != null) {
                try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        String w = line.trim().toUpperCase();
                        if (!w.isEmpty()) set.add(w);
                    }
                }
            }
        } catch (Exception ignored) { /* fall back to empty */ }
        return new WordList(set);
    }
}
