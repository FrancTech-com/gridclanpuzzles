package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A Monopoly table (tournament-only; 2-8 players, marketed for 6-8). The full
 * rules state lives in the JSON {@code state} column ({@code MonopolyState});
 * {@code players_csv} mirrors the seat order for cheap membership checks.
 */
@Entity
@Table(name = "monopoly_games")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MonopolyGame {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** ACTIVE | COMPLETE */
    @Column(nullable = false, length = 24)
    @Builder.Default
    private String status = "ACTIVE";

    /** Seat order, comma-separated player UUIDs. */
    @Column(name = "players_csv", nullable = false, columnDefinition = "text")
    private String playersCsv;

    @Column(nullable = false, columnDefinition = "text")
    private String state;

    @Column(name = "winner_id")
    private UUID winnerId;

    @Column(name = "last_move_at", nullable = false)
    @Builder.Default
    private Instant lastMoveAt = Instant.now();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
