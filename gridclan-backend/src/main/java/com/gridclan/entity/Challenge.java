package com.gridclan.entity;

import com.gridclan.entity.enums.GameType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * An async friend challenge: the creator and one opponent each solve the same
 * captured board. The winner is whoever's authoritative server score is higher.
 * Closed-loop entertainment — no stakes, no real-world value.
 */
@Entity
@Table(name = "challenges")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Challenge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Short, shareable code (e.g. "K7P2Q9"). Unique. */
    @Column(nullable = false, unique = true, length = 12)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "game_type", nullable = false, length = 50)
    private GameType gameType;

    /** The shared puzzle — both players get this exact board. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "board_state", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> boardState;

    @Column(name = "creator_id", nullable = false)
    private UUID creatorId;

    @Column(name = "creator_session_id", nullable = false)
    private UUID creatorSessionId;

    @Column(name = "creator_score")
    private Integer creatorScore;

    @Column(name = "opponent_id")
    private UUID opponentId;

    @Column(name = "opponent_session_id")
    private UUID opponentSessionId;

    @Column(name = "opponent_score")
    private Integer opponentScore;

    /** PENDING until both players have finished, then COMPLETE. */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
