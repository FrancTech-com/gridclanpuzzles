package com.gridclan.entity;

import com.gridclan.entity.enums.GameTier;
import com.gridclan.entity.enums.GameType;
import com.gridclan.entity.enums.SessionStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Hot partition table — no FK on user_id to avoid cascade overhead.
 * Rows > 30 days are archived nightly via archive_old_sessions() procedure.
 * board_state is JSONB — server is sole source of truth.
 */
@Entity
@Table(name = "active_sessions")
@IdClass(ActiveSessionId.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActiveSession {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(name = "started_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant startedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @Column(name = "game_type", nullable = false, length = 50)
    private GameType gameType;

    @Enumerated(EnumType.STRING)
    @Column(name = "tier", nullable = false, length = 30)
    private GameTier tier;

    @Column(name = "tournament_id")
    private UUID tournamentId;

    /**
     * JSONB column — authoritative board state.
     * Client receives this as a display payload; never computes it locally.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "board_state", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> boardState;

    @Column(name = "server_score", nullable = false)
    @Builder.Default
    private int serverScore = 0;

    @Column(name = "move_count", nullable = false)
    @Builder.Default
    private int moveCount = 0;

    /**
     * Set by server at session creation — client cannot override.
     * false for COMMUNITY_TOURNAMENT tier; true otherwise.
     */
    @Column(name = "hints_allowed", nullable = false)
    private boolean hintsAllowed;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private SessionStatus status = SessionStatus.ACTIVE;

    @Column(name = "last_move_at", nullable = false)
    @Builder.Default
    private Instant lastMoveAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;
}
