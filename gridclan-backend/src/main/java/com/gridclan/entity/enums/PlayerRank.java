package com.gridclan.entity.enums;

/**
 * Player progression rank, derived purely from lifetime points earned.
 *
 * Single source of truth for the three rank-dependent rules:
 *   • promotion threshold (lifetime points)
 *   • gems awarded per win
 *   • hints granted per solo (vs-computer) game
 *
 * Beginner → Amateur (25k) → Professional (150k). Professional is the top rank.
 */
public enum PlayerRank {

    //         minPoints   gemsPerWin   soloHints
    BEGINNER(        0L,          5,         5),
    AMATEUR(    25_000L,         10,         3),
    PROFESSIONAL(150_000L,       15,         0);

    public final long minPoints;
    public final long gemsPerWin;
    public final int  soloHints;

    PlayerRank(long minPoints, long gemsPerWin, int soloHints) {
        this.minPoints  = minPoints;
        this.gemsPerWin = gemsPerWin;
        this.soloHints  = soloHints;
    }

    /** The rank a player holds at the given lifetime-points total. */
    public static PlayerRank fromPoints(long lifetimePoints) {
        if (lifetimePoints >= PROFESSIONAL.minPoints) return PROFESSIONAL;
        if (lifetimePoints >= AMATEUR.minPoints)      return AMATEUR;
        return BEGINNER;
    }

    /** The next rank up, or null if already at the top. */
    public PlayerRank next() {
        return switch (this) {
            case BEGINNER     -> AMATEUR;
            case AMATEUR      -> PROFESSIONAL;
            case PROFESSIONAL -> null;
        };
    }

    /** Human label for display ("Beginner", "Amateur", "Professional"). */
    public String label() {
        return name().charAt(0) + name().substring(1).toLowerCase();
    }
}
