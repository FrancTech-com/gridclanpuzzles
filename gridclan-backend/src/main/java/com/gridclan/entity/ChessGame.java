package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A 2-player chess game (friend invite or tournament match). Player 1 is
 * always white, player 2 black. Full rules state lives in the FEN; the moves
 * are kept as a space-separated UCI list for replay/spectating.
 */
@Entity
@Table(name = "chess_games")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChessGame {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invite_code", nullable = false, unique = true, length = 12)
    private String inviteCode;

    /** White. */
    @Column(name = "player1_id", nullable = false)
    private UUID player1Id;

    /** Black. */
    @Column(name = "player2_id")
    private UUID player2Id;

    /** WAITING_FOR_OPPONENT | ACTIVE | COMPLETE */
    @Column(nullable = false, length = 24)
    @Builder.Default
    private String status = "WAITING_FOR_OPPONENT";

    /** 1 = white to move, 2 = black (mirrors the FEN; kept for quick queries). */
    @Column(name = "current_player", nullable = false)
    @Builder.Default
    private short currentPlayer = 1;

    @Column(nullable = false, columnDefinition = "text")
    private String fen;

    /** Space-separated UCI moves, oldest first ("e2e4 e7e5 ..."). */
    @Column(name = "move_log", nullable = false, columnDefinition = "text")
    @Builder.Default
    private String moveLog = "";

    @Column(name = "winner_id")
    private UUID winnerId;

    /** CHECKMATE | STALEMATE | DRAW_50 | DRAW_MATERIAL | RESIGN | TIMEOUT */
    @Column(name = "end_reason", length = 24)
    private String endReason;

    /** True when player2 is the computer (solo game). */
    @Column(name = "vs_computer", nullable = false)
    @Builder.Default
    private boolean vsComputer = false;

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

    /** Non-null while the game is paused — the turn clock is frozen. */
    @Column(name = "paused_at")
    private Instant pausedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
