package com.gridclan.controller;

import com.gridclan.dto.ChatMessage;
import com.gridclan.entity.CommunityMessage;
import com.gridclan.repository.CommunityMemberRepository;
import com.gridclan.repository.CommunityMessageRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.handler.annotation.*;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * STOMP WebSocket chat controller.
 *
 * Subscribe:  /topic/community/{communityId}
 * Send:       /app/community/{communityId}/chat  → @MessageMapping
 *
 * Rate limiting:
 *   Redis counter "wschat:{userId}" → max 5 messages / 3s.
 *   Mirrors RateLimitFilter's /community/chat rule for HTTP clients.
 *   Violation: message silently dropped (no disconnect — avoids reconnect storms).
 *
 * Membership gate:
 *   Sender must be an active member of the community.
 *   Non-members get a SYSTEM error message back on their private queue.
 *
 * Content rules:
 *   Max 500 chars. Server truncates silently rather than rejecting.
 *   Server always sets senderId + senderName from JWT — client-supplied
 *   identity is ignored.
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final SimpMessagingTemplate      broker;
    private final CommunityMemberRepository  memberRepo;
    private final CommunityMessageRepository messageRepo;
    private final UserRepository             userRepo;
    private final RedisTemplate<String, String> redis;

    private static final int    CHAT_RATE_MAX = 5;
    private static final int    CHAT_RATE_SEC = 3;
    private static final int    MAX_MSG_LEN   = 500;

    // ── Handle incoming chat message ───────────────────────────────────────

    @MessageMapping("/community/{communityId}/chat")
    public void handleChat(
            @DestinationVariable UUID communityId,
            @Payload ChatMessage msg,
            SimpMessageHeaderAccessor headerAccessor,
            Principal principal) {

        UUID userId = UUID.fromString(principal.getName());

        // ── Rate limit (Redis sliding window) ────────────────────────────
        if (isRateLimited(userId)) {
            log.debug("WS rate limit hit: userId={}", userId);
            return;  // Drop silently — don't disconnect
        }

        // ── Membership check ──────────────────────────────────────────────
        if (memberRepo.findByCommunityIdAndUserId(communityId, userId).isEmpty()) {
            broker.convertAndSendToUser(
                userId.toString(), "/queue/errors",
                ChatMessage.builder()
                    .type(ChatMessage.Type.SYSTEM)
                    .content("You are not a member of this community.")
                    .sentAt(Instant.now())
                    .build());
            return;
        }

        // ── Build enriched broadcast message ─────────────────────────────
        String displayName = userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : "Player")
            .orElse("Player");

        String content = msg.getContent();
        if (content != null && content.length() > MAX_MSG_LEN) {
            content = content.substring(0, MAX_MSG_LEN);
        }

        Instant sentAt = Instant.now();
        ChatMessage broadcast = ChatMessage.builder()
            .type(ChatMessage.Type.CHAT)
            .content(content)
            .senderId(userId)            // Server sets this — client field ignored
            .senderName(displayName)
            .communityId(communityId)
            .sentAt(sentAt)
            .build();

        // ── Persist so the community keeps its full history ───────────────
        if (content != null && !content.isBlank()) {
            try {
                messageRepo.save(CommunityMessage.builder()
                    .communityId(communityId)
                    .senderId(userId)
                    .senderName(displayName)
                    .content(content)
                    .sentAt(sentAt)
                    .build());
            } catch (Exception e) {
                log.warn("Failed to persist chat message: {}", e.getMessage());
            }
        }

        // ── Broadcast to all community subscribers ────────────────────────
        broker.convertAndSend("/topic/community/" + communityId, broadcast);
        log.debug("Chat broadcast: community={} userId={} len={}",
            communityId, userId, content != null ? content.length() : 0);
    }

    // ── Join event — sent when user subscribes ────────────────────────────

    @SubscribeMapping("/topic/community/{communityId}")
    public void handleSubscribe(
            @DestinationVariable UUID communityId,
            Principal principal) {
        UUID userId = UUID.fromString(principal.getName());

        String displayName = userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : "Player")
            .orElse("Player");

        broker.convertAndSend("/topic/community/" + communityId,
            ChatMessage.builder()
                .type(ChatMessage.Type.JOIN)
                .content(displayName + " joined the channel.")
                .senderId(userId)
                .senderName(displayName)
                .communityId(communityId)
                .sentAt(Instant.now())
                .build());
    }

    // ── Redis rate limiter ────────────────────────────────────────────────

    private boolean isRateLimited(UUID userId) {
        String key   = "wschat:" + userId;
        Long   count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, Duration.ofSeconds(CHAT_RATE_SEC));
        }
        return count != null && count > CHAT_RATE_MAX;
    }
}
