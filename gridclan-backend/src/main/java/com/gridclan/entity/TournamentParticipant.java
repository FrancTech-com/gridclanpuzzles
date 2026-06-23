package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Many-to-many join between tournaments and users.
 * Backed by the tournament_participants table (V2 migration).
 * Rows are CASCADE-deleted when the tournament or user is removed.
 * On user erasure: removeParticipant() called by AccountDeletionService.
 */
@Entity
@Table(name = "tournament_participants",
    uniqueConstraints = @UniqueConstraint(columnNames = {"tournament_id", "user_id"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TournamentParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "joined_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant joinedAt = Instant.now();

    /** ACTIVE | ELIMINATED | WITHDRAWN */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "final_score")
    private Integer finalScore;

    @Column(name = "final_rank")
    private Integer finalRank;
}
