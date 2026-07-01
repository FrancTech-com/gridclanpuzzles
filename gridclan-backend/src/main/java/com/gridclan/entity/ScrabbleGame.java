package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A shared-board, turn-based 2-player Grid Scrabble game. Async: players
 * alternate turns without needing to be online together. Board/bag/racks are
 * stored as compact text (see V12 migration). Server-authoritative.
 */
@Entity
@Table(name = "scrabble_games")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ScrabbleGame {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invite_code", nullable = false, unique = true, length = 12)
    private String inviteCode;

    @Column(name = "player1_id", nullable = false)
    private UUID player1Id;

    @Column(name = "player2_id")
    private UUID player2Id;

    /** WAITING_FOR_OPPONENT | ACTIVE | COMPLETE */
    @Column(nullable = false, length = 24)
    @Builder.Default
    private String status = "WAITING_FOR_OPPONENT";

    @Column(name = "current_player", nullable = false)
    @Builder.Default
    private short currentPlayer = 1;     // 1 or 2 — whose turn

    @Column(nullable = false, columnDefinition = "text")
    private String board;                // 15 lines; '.'=empty, UPPER=tile, lower=blank

    @Column(nullable = false, columnDefinition = "text")
    private String bag;                  // remaining tiles ('_' = blank)

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack1 = "";

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack2 = "";

    @Column(nullable = false) @Builder.Default private int score1 = 0;
    @Column(nullable = false) @Builder.Default private int score2 = 0;

    @Column(name = "pass_streak", nullable = false)
    @Builder.Default
    private short passStreak = 0;

    @Column(name = "winner_id")
    private UUID winnerId;

    /** True when player2 is the computer (solo game). */
    @Column(name = "vs_computer", nullable = false)
    @Builder.Default
    private boolean vsComputer = false;

    /** Free hints left in a solo game, granted by the player's rank. */
    @Column(name = "hints_remaining", nullable = false)
    @Builder.Default
    private int hintsRemaining = 0;

    /** Difficulty ladder for a solo game (EASY/MEDIUM/HARD); null for PvP. */
    @Column(name = "difficulty", length = 10)
    private String difficulty;

    /** Ladder level (1..20) for a solo game; 0 for PvP. */
    @Column(name = "level", nullable = false)
    @Builder.Default
    private int level = 0;

    @Column(name = "last_move_at", nullable = false)
    @Builder.Default
    private Instant lastMoveAt = Instant.now();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
