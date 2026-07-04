package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One match in a tournament.
 *
 * Backed by a real per-game row ({@code game_id}) created pre-paired/seated.
 * Head-to-head matches use player1/player2 (player2 null = bye). Scrabble
 * group games seat up to 4 (player3/player4); Monopoly tables seat up to 8
 * (players 5-8 go in {@code extra_players}, CSV).
 *
 * {@code bracket} separates the MAIN draw from the CONSOLATION draw (played
 * by first-round eliminees), plus the FINAL/THIRD_PLACE kinds within a draw.
 * A group match advances its top two: {@code winner_id} and {@code runner_up_id}.
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

    /** 1-based round number (numbered independently per bracket). */
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

    @Column(name = "player3_id")
    private UUID player3Id;

    @Column(name = "player4_id")
    private UUID player4Id;

    /** Players 5-8 for big tables (CSV of UUIDs), else null. */
    @Column(name = "extra_players", columnDefinition = "text")
    private String extraPlayers;

    /** MAIN | CONSOLATION */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String bracket = "MAIN";

    /** H2H (pair) | GROUP (top-2 advance) | FINAL | THIRD_PLACE */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String kind = "H2H";

    @Column(name = "game_type", nullable = false, length = 32)
    private String gameType;

    /** The backing game row id, once the match's game has been created. */
    @Column(name = "game_id")
    private UUID gameId;

    @Column(name = "winner_id")
    private UUID winnerId;

    /** Second qualifier out of a GROUP match (top 2 advance). */
    @Column(name = "runner_up_id")
    private UUID runnerUpId;

    /** PENDING | ACTIVE | COMPLETE | BYE */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /** Every seated player, in order (never null entries). */
    public java.util.List<UUID> allPlayers() {
        java.util.List<UUID> out = new java.util.ArrayList<>();
        if (player1Id != null) out.add(player1Id);
        if (player2Id != null) out.add(player2Id);
        if (player3Id != null) out.add(player3Id);
        if (player4Id != null) out.add(player4Id);
        if (extraPlayers != null && !extraPlayers.isBlank()) {
            for (String s : extraPlayers.split(",")) {
                if (!s.isBlank()) out.add(UUID.fromString(s.trim()));
            }
        }
        return out;
    }

    public boolean hasPlayer(UUID userId) {
        return userId != null && allPlayers().contains(userId);
    }
}
