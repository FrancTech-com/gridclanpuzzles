package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A shared-board, turn-based Grid Scrabble game for 2-4 players. Async: players
 * take turns in seat order without needing to be online together. Board/bag/racks
 * are stored as compact text (see V12/V36 migrations). Server-authoritative.
 */
@Entity
@Table(name = "scrabble_games")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ScrabbleGame {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invite_code", nullable = false, unique = true, length = 12)
    private String inviteCode;

    @Column(name = "player1_id", nullable = false)
    private UUID player1Id;

    @Column(name = "player2_id")
    private UUID player2Id;

    @Column(name = "player3_id")
    private UUID player3Id;

    @Column(name = "player4_id")
    private UUID player4Id;

    /** WAITING_FOR_OPPONENT | ACTIVE | COMPLETE */
    @Column(nullable = false, length = 24)
    @Builder.Default
    private String status = "WAITING_FOR_OPPONENT";

    @Column(name = "current_player", nullable = false)
    @Builder.Default
    private short currentPlayer = 1;     // seat (1..maxPlayers) — whose turn

    /** Seats in this game: 2 (classic head-to-head) up to 4 (group game). */
    @Column(name = "max_players", nullable = false)
    @Builder.Default
    private short maxPlayers = 2;

    /** Bit i (1-based seat) set = that player resigned but the game plays on. */
    @Column(name = "resigned_mask", nullable = false)
    @Builder.Default
    private short resignedMask = 0;

    @Column(nullable = false, columnDefinition = "text")
    private String board;                // 15 lines; '.'=empty, UPPER=tile, lower=blank

    @Column(nullable = false, columnDefinition = "text")
    private String bag;                  // remaining tiles ('_' = blank)

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack1 = "";

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack2 = "";

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack3 = "";

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String rack4 = "";

    @Column(nullable = false) @Builder.Default private int score1 = 0;
    @Column(nullable = false) @Builder.Default private int score2 = 0;
    @Column(nullable = false) @Builder.Default private int score3 = 0;
    @Column(nullable = false) @Builder.Default private int score4 = 0;

    /** One JSON object per line, newest last — every word/pass/swap/resign/timeout. */
    @Column(name = "move_log", nullable = false, columnDefinition = "text")
    @Builder.Default
    private String moveLog = "";

    @Column(name = "pass_streak", nullable = false)
    @Builder.Default
    private short passStreak = 0;

    @Column(name = "winner_id")
    private UUID winnerId;

    /** True when player2 is the computer (solo game). */
    @Column(name = "vs_computer", nullable = false)
    @Builder.Default
    private boolean vsComputer = false;

    /** Free hints left in a solo game, granted by the player's rank. */
    @Column(name = "hints_remaining", nullable = false)
    @Builder.Default
    private int hintsRemaining = 0;

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

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    // ── Seat helpers (1-based seats; keep the flat columns manageable) ────────

    public UUID playerId(int seat) {
        return switch (seat) {
            case 1 -> player1Id; case 2 -> player2Id;
            case 3 -> player3Id; case 4 -> player4Id;
            default -> null;
        };
    }

    public void setPlayerId(int seat, UUID id) {
        switch (seat) {
            case 1 -> player1Id = id; case 2 -> player2Id = id;
            case 3 -> player3Id = id; case 4 -> player4Id = id;
            default -> throw new IllegalArgumentException("seat " + seat);
        }
    }

    public String rack(int seat) {
        return switch (seat) {
            case 1 -> rack1; case 2 -> rack2; case 3 -> rack3; case 4 -> rack4;
            default -> "";
        };
    }

    public void setRack(int seat, String rack) {
        switch (seat) {
            case 1 -> rack1 = rack; case 2 -> rack2 = rack;
            case 3 -> rack3 = rack; case 4 -> rack4 = rack;
            default -> throw new IllegalArgumentException("seat " + seat);
        }
    }

    public int score(int seat) {
        return switch (seat) {
            case 1 -> score1; case 2 -> score2; case 3 -> score3; case 4 -> score4;
            default -> 0;
        };
    }

    public void setScore(int seat, int score) {
        switch (seat) {
            case 1 -> score1 = score; case 2 -> score2 = score;
            case 3 -> score3 = score; case 4 -> score4 = score;
            default -> throw new IllegalArgumentException("seat " + seat);
        }
    }

    public boolean isResigned(int seat) { return (resignedMask & (1 << seat)) != 0; }

    public void markResigned(int seat)  { resignedMask |= (short) (1 << seat); }

    /** Seat of the given player, or 0 if they're not in this game. */
    public int seatOf(UUID userId) {
        for (int s = 1; s <= maxPlayers; s++) {
            if (userId != null && userId.equals(playerId(s))) return s;
        }
        return 0;
    }

    /** How many seats are filled so far. */
    public int seatedCount() {
        int n = 0;
        for (int s = 1; s <= maxPlayers; s++) if (playerId(s) != null) n++;
        return n;
    }

    /** Players still in the game (seated and not resigned). */
    public int activeCount() {
        int n = 0;
        for (int s = 1; s <= maxPlayers; s++) if (playerId(s) != null && !isResigned(s)) n++;
        return n;
    }
}
