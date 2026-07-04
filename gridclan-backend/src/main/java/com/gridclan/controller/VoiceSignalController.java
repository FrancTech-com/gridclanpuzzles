package com.gridclan.controller;

import com.gridclan.dto.VoiceSignal;
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
import java.util.UUID;

/**
 * STOMP relay for in-game group WebRTC voice (a mesh room per game/table).
 *
 * Subscribe:  /topic/{kind}/{gameId}/voice   (every seat; sibling of the move-ping topic)
 * Send:       /app/{kind}/{gameId}/voice     → @MessageMapping
 *
 * The server never carries audio — only the small signalling frames. It:
 *   1. verifies the sender is seated at {gameId} (any of the 2-8 players),
 *   2. rate-limits JOIN to 1 / 5s so a tap can't spam the room,
 *   3. stamps the sender identity server-side (client-supplied identity ignored),
 *   4. broadcasts to the per-game voice topic. Clients ignore their own frames and
 *      any directed frame whose toUserId isn't theirs.
 *
 * kind ∈ { scrabble, gomoku, battleship, chess, monopoly }.
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class VoiceSignalController {

    private final SimpMessagingTemplate       broker;
    private final UserRepository              userRepo;
    private final GameParticipantResolver     participantResolver;
    private final RedisTemplate<String, String> redis;

    /** One JOIN per this many seconds, per user. */
    private static final int RING_RATE_SEC = 5;

    @MessageMapping("/{kind}/{gameId}/voice")
    public void relay(
            @DestinationVariable String kind,
            @DestinationVariable UUID gameId,
            @Payload VoiceSignal sig,
            Principal principal) {

        UUID userId = UUID.fromString(principal.getName());

        // ── Participant gate — only players seated at this game may signal ──
        if (!participantResolver.isParticipant(kind, gameId, userId)) {
            log.debug("Voice signal rejected — userId={} not seated at {} {}", userId, kind, gameId);
            return;
        }

        // ── Anti-spam: only throttle JOIN, not the WebRTC handshake frames ──
        if (sig.getType() == VoiceSignal.Type.JOIN && sig.getToUserId() == null
                && isRingRateLimited(userId)) {
            return;
        }

        // ── Server-stamp identity ────────────────────────────────────────────
        String name = userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : "Player")
            .orElse("Player");

        sig.setFromUserId(userId);
        sig.setFromName(name);
        sig.setGameKind(kind);
        sig.setSentAt(Instant.now());

        broker.convertAndSend("/topic/" + kind + "/" + gameId + "/voice", sig);
    }

    /** Redis sliding window — mirrors ChatController's rate limiter. */
    private boolean isRingRateLimited(UUID userId) {
        String key   = "wsvoice:" + userId;
        Long   count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, Duration.ofSeconds(RING_RATE_SEC));
        }
        return count != null && count > 1;
    }
}
