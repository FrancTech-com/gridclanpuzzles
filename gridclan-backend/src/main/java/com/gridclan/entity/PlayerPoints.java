package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "player_points")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlayerPoints {

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

    @Column(name = "lifetime_spent", nullable = false)
    @Builder.Default
    private long lifetimeSpent = 0L;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = Instant.now(); }
}
