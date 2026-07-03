package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One in-game chat message between the two players of a real-time game.
 * Short-lived by design: purged after 7 days (see GameChatService cleanup).
 * senderName is frozen at send time — game chat is throwaway, no need to
 * chase display-name changes.
 */
@Entity
@Table(name = "game_chat_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GameChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** scrabble | gomoku | battleship. */
    @Column(nullable = false, length = 16)
    private String kind;

    @Column(name = "game_id", nullable = false)
    private UUID gameId;

    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    @Column(name = "sender_name", nullable = false, length = 64)
    private String senderName;

    @Column(nullable = false, length = 300)
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
