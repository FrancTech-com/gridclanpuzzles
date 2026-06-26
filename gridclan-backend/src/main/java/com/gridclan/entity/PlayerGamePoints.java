package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Per-game points total for a player — one row per (user, game).
 *
 * Feeds the per-game / breakdown leaderboard. The aggregate spendable score
 * still lives in {@link PlayerPoints}; this table just records how a player's
 * earned points split across the four games. {@code gameType} is a plain string
 * key ("WORD_SEARCH", "SCRABBLE", "GOMOKU", "BATTLESHIP") rather than the
 * GameType enum, since the three real-time games are not GameType values.
 */
@Entity
@Table(name = "player_game_points",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "game_type"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlayerGamePoints {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "game_type", nullable = false, length = 32)
    private String gameType;

    @Column(nullable = false)
    @Builder.Default
    private long points = 0L;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}
