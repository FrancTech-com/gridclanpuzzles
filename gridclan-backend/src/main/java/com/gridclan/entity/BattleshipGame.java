package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A real-time 2-player Battleship game. Each player has a 10×10 home grid with a
 * randomly-placed fleet; players alternate firing at the opponent's grid. The two
 * home grids are stored as compact text — a player's own ships are never sent to
 * the opponent (see BattleshipGameService.view). Server-authoritative.
 */
@Entity
@Table(name = "battleship_games")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BattleshipGame {

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
    private short currentPlayer = 1;     // 1 or 2 — whose turn to fire

    /**
     * Each home grid: 10 lines of 10 chars.
     *   '.' = water (untouched)   'S' = ship (untouched)
     *   'O' = miss (water fired)  'X' = hit (ship fired)
     * board1 is player1's waters (player2 fires at it), board2 is player2's.
     */
    @Column(name = "board1", nullable = false, columnDefinition = "text")
    private String board1;

    @Column(name = "board2", columnDefinition = "text")
    private String board2;

    @Column(name = "winner_id")
    private UUID winnerId;

    @Column(name = "last_move_at", nullable = false)
    @Builder.Default
    private Instant lastMoveAt = Instant.now();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
