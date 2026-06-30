package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A player's in-app comment about the app/games. Read only on the admin
 * dashboard — never surfaced to other users.
 */
@Entity
@Table(name = "feedback")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Feedback {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "display_name", length = 60)
    private String displayName;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(nullable = false)
    @Builder.Default
    private boolean handled = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
