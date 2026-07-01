package com.gridclan.entity.enums;

/**
 * Difficulty for solo / vs-computer play. Each difficulty is a locked ladder of
 * {@link #LEVELS} levels (finish level N to unlock N+1).
 *
 * SINGLE SOURCE OF TRUTH for two things:
 *   1. The puzzle parameters a difficulty produces (grid size, word count, which
 *      placement directions are allowed) — see the Word Search generator.
 *   2. How points scale. Final points = base · difficultyMultiplier · levelMultiplier,
 *      so Hard pays more than Medium pays more than Easy, and within a difficulty a
 *      later level pays more than an earlier one. This scaling is deliberate
 *      groundwork for a future "earning" feature (purely in-app, no cashout).
 *
 * Easy really is easy (small grid, few short words, no diagonals or reversed words);
 * Hard really is hard (big grid, many words, diagonals AND reversed words).
 */
public enum Difficulty {
    //        mult  baseGrid  baseWords  diagonals  reversed
    EASY  (1.0,   8,        5,         false,     false),
    MEDIUM(1.6,  10,        7,         true,      false),
    HARD  (2.5,  12,        9,         true,      true);

    /** Levels per difficulty ladder. */
    public static final int LEVELS = 20;

    private final double  pointsMultiplier;
    private final int     baseGridSize;
    private final int     baseWordCount;
    private final boolean allowDiagonal;
    private final boolean allowReverse;

    Difficulty(double pointsMultiplier, int baseGridSize, int baseWordCount,
               boolean allowDiagonal, boolean allowReverse) {
        this.pointsMultiplier = pointsMultiplier;
        this.baseGridSize     = baseGridSize;
        this.baseWordCount    = baseWordCount;
        this.allowDiagonal    = allowDiagonal;
        this.allowReverse     = allowReverse;
    }

    public boolean allowDiagonal() { return allowDiagonal; }
    public boolean allowReverse()  { return allowReverse;  }

    /** True if {@code level} is a valid 1..LEVELS ladder position. */
    public static boolean validLevel(int level) {
        return level >= 1 && level <= LEVELS;
    }

    /**
     * Grid size for a given level within this difficulty. The grid grows by up to
     * 3 cells across the 20-level ladder so later levels feel bigger.
     */
    public int gridSizeFor(int level) {
        int bump = (clamp(level) - 1) * 3 / (LEVELS - 1);   // 0..3 across the ladder
        return baseGridSize + bump;
    }

    /**
     * Number of words to hide for a given level. Grows by up to 4 across the ladder,
     * but never more than the grid can reasonably hold.
     */
    public int wordCountFor(int level) {
        int bump = (clamp(level) - 1) * 4 / (LEVELS - 1);   // 0..4 across the ladder
        return baseWordCount + bump;
    }

    /**
     * Points multiplier for a level: difficulty multiplier times a level multiplier
     * that ramps from 1.0 at level 1 to ~1.95 at level 20 (+0.05 per level).
     */
    public double pointsMultiplierFor(int level) {
        double levelMult = 1.0 + (clamp(level) - 1) * 0.05;
        return pointsMultiplier * levelMult;
    }

    /**
     * AI-strength knob for the vs-computer board games (Gomoku/Battleship/Scrabble):
     * the probability that the computer plays a deliberately weak move instead of its
     * best one. Easy blunders often, Hard almost never; within a difficulty the chance
     * shrinks toward the top of the ladder, so level 20 is the toughest. 0 = full
     * strength. Each game interprets a "weak move" appropriately (random square /
     * random shot / pass).
     */
    public double aiBlunderChance(int level) {
        double base = switch (this) { case EASY -> 0.50; case MEDIUM -> 0.22; case HARD -> 0.06; };
        double top  = switch (this) { case EASY -> 0.32; case MEDIUM -> 0.10; case HARD -> 0.0;  };
        return base + (top - base) * (clamp(level) - 1) / (LEVELS - 1);
    }

    /** Parse a stored difficulty name, or null if absent/blank. */
    public static Difficulty fromName(String name) {
        if (name == null || name.isBlank()) return null;
        return Difficulty.valueOf(name);
    }

    private static int clamp(int level) {
        return Math.max(1, Math.min(LEVELS, level));
    }
}
