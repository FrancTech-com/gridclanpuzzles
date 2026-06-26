package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A persisted community chat message. Every chat message is saved here from the
 * moment a community starts, so members joining later can scroll back through the
 * full history (loaded via GET /community/{id}/messages). The live STOMP broadcast
 * is unchanged — this is the durable record behind it.
 */
@Entity
@Table(name = "chat_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CommunityMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "community_id", nullable = false)
    private UUID communityId;

    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    @Column(name = "sender_name", nullable = false, length = 120)
    private String senderName;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "sent_at", nullable = false)
    @Builder.Default
    private Instant sentAt = Instant.now();
}
