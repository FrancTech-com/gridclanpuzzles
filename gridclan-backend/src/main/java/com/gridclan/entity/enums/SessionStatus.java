package com.gridclan.entity.enums;

public enum SessionStatus {
    ACTIVE,
    COMPLETED,
    FLAGGED,
    ABANDONED,
    /** Out of moves — the player can revive (spend gems) to get more, or give up. */
    OUT_OF_MOVES
}
