package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One match in a single-elimination tournament bracket.
 *
 * Backed by a real per-game row ({@code game_id} → scrabble/gomoku/battleship)
 * created pre-paired. A {@code player2_id} of null means a bye — {@code player1}
 * auto-advances. The winner advances to the next round; the loser's participant
 * row is flipped to ELIMINATED.
 */
@Entity
@Table(name = "tournament_matches")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TournamentMatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    /** 1-based round number. */
    @Column(nullable = false)
    private int round;

    /** Position within the round (0-based). */
    @Column(nullable = false)
    private int slot;

    @Column(name = "player1_id")
    private UUID player1Id;

    /** null = bye (player1 auto-advances). */
    @Column(name = "player2_id")
    private UUID player2Id;

    @Column(name = "game_type", nullable = false, length = 32)
    private String gameType;

    /** The backing game row id, once the match's game has been created. */
    @Column(name = "game_id")
    private UUID gameId;

    @Column(name = "winner_id")
    private UUID winnerId;

    /** PENDING | ACTIVE | COMPLETE | BYE */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
