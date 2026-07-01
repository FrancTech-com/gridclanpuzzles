package com.gridclan.entity;

import com.gridclan.entity.enums.Difficulty;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * A player's progress on one difficulty ladder of one game — one row per
 * (user, gameType, difficulty).
 *
 * {@code highestUnlocked} is the furthest level the player may start (a locked
 * ladder: finishing level N unlocks N+1). {@code bestScores} maps a level number
 * (as a String key, since it's JSONB) to the best score achieved on that level.
 *
 * {@code gameType} is a plain String key ("WORD_SEARCH", …) to match
 * {@link PlayerGamePoints} — the three real-time games aren't GameType enum values.
 */
@Entity
@Table(name = "player_level_progress",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "game_type", "difficulty"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlayerLevelProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "game_type", nullable = false, length = 32)
    private String gameType;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty", nullable = false, length = 10)
    private Difficulty difficulty;

    @Column(name = "highest_unlocked", nullable = false)
    @Builder.Default
    private int highestUnlocked = 1;

    /** level (String) → best score. JSONB. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "best_scores", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Integer> bestScores = new HashMap<>();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}
