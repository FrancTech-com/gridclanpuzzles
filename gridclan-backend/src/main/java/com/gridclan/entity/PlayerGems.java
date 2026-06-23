package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One row per user. Gems are a CLOSED-LOOP in-game currency with NO
 * real-world value and NO cashout path — legally equivalent to any standard
 * mobile-game currency. balance must always be >= 0 (DB CHECK).
 */
@Entity
@Table(name = "player_gems")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlayerGems {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(nullable = false)
    @Builder.Default
    private long balance = 0L;

    @Column(name = "lifetime_earned", nullable = false)
    @Builder.Default
    private long lifetimeEarned = 0L;

    @Column(name = "lifetime_gifted", nullable = false)
    @Builder.Default
    private long lifetimeGifted = 0L;

    @Column(name = "lifetime_received", nullable = false)
    @Builder.Default
    private long lifetimeReceived = 0L;

    @Column(name = "lifetime_spent", nullable = false)
    @Builder.Default
    private long lifetimeSpent = 0L;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = Instant.now(); }
}
