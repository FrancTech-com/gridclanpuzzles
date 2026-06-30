package com.gridclan.controller;

import com.gridclan.repository.UserRepository;
import com.gridclan.service.GameParticipantResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Lightweight in-game text chat between the two players of a real-time game.
 *
 * Send:       /app/game/{kind}/{gameId}/chat   → @MessageMapping
 * Subscribe:  /topic/game/{kind}/{gameId}/chat (both players)
 *
 * The /game/ prefix keeps this distinct from community chat (/community/{id}/chat).
 * Ephemeral — game chat is throwaway and never persisted (unlike community
 * history). Server gates to the two participants, rate-limits 5 msgs / 3s, caps
 * length, and stamps the sender identity (client-supplied identity ignored).
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class GameChatController {

    private final SimpMessagingTemplate         broker;
    private final UserRepository                userRepo;
    private final GameParticipantResolver       participantResolver;
    private final RedisTemplate<String, String> redis;

    private static final int CHAT_RATE_MAX = 5;
    private static final int CHAT_RATE_SEC = 3;
    private static final int MAX_MSG_LEN   = 300;

    @MessageMapping("/game/{kind}/{gameId}/chat")
    public void chat(
            @DestinationVariable String kind,
            @DestinationVariable UUID gameId,
            @Payload Map<String, String> payload,
            Principal principal) {

        UUID userId = UUID.fromString(principal.getName());

        if (!participantResolver.isParticipant(kind, gameId, userId)) {
            log.debug("Game chat rejected — userId={} not a player of {} {}", userId, kind, gameId);
            return;
        }
        if (isRateLimited(userId)) return;  // drop silently

        String content = payload.getOrDefault("content", "").trim();
        if (content.isEmpty()) return;
        if (content.length() > MAX_MSG_LEN) content = content.substring(0, MAX_MSG_LEN);

        String name = userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : "Player")
            .orElse("Player");

        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("senderId",   userId.toString());
        msg.put("senderName", name);
        msg.put("content",    content);
        msg.put("sentAt",     Instant.now().toString());

        broker.convertAndSend("/topic/game/" + kind + "/" + gameId + "/chat", msg);
    }

    /** Redis sliding window — mirrors ChatController's community rate limiter. */
    private boolean isRateLimited(UUID userId) {
        String key   = "wsgamechat:" + userId;
        Long   count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, Duration.ofSeconds(CHAT_RATE_SEC));
        }
        return count != null && count > CHAT_RATE_MAX;
    }
}
