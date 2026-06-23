package com.gridclan.dto;

import jakarta.validation.constraints.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * STOMP chat message payload.
 *
 * Client sends:   {type, content}
 * Server echoes:  {type, content, senderId, senderName, communityId, sentAt}
 *
 * Message types:
 *   CHAT     — normal text message
 *   JOIN     — user joined the community channel (server-generated)
 *   LEAVE    — user left (server-generated)
 *   SYSTEM   — server announcement (tournament start, distribution, etc.)
 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatMessage {

    public enum Type { CHAT, JOIN, LEAVE, SYSTEM }

    @NotNull
    private Type type;

    @NotBlank
    @Size(max = 500, message = "Message too long (max 500 chars)")
    private String content;

    // Server-populated fields (clients must not set these — ignored if present)
    private UUID   senderId;
    private String senderName;
    private UUID   communityId;
    private Instant sentAt;
}
