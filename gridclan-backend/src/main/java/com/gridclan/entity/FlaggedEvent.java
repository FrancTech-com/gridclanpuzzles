package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** Anti-cheat violation record — append-only, never deleted. */
@Entity
@Table(name = "flagged_events")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FlaggedEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "game_type", length = 50)
    private String gameType;

    /** 'SPEED_VIOLATION' | 'IMPOSSIBLE_MOVE' */
    @Column(nullable = false, length = 100)
    private String reason;

    private String detail;

    @Column(name = "flagged_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant flaggedAt = Instant.now();
}
