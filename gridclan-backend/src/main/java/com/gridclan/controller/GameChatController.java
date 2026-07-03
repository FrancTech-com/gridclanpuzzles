package com.gridclan.controller;

import com.gridclan.service.GameChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

/**
 * WebSocket entry point for in-game chat (fast path).
 *
 * Send:       /app/game/{kind}/{gameId}/chat   → @MessageMapping
 * Subscribe:  /topic/game/{kind}/{gameId}/chat (both players)
 *
 * Persistence, participant gating, name stamping and the broadcast all live in
 * GameChatService — shared with the REST endpoints (GameChatRestController)
 * that give chat its history load and no-WebSocket fallback.
 */
@Controller
@RequiredArgsConstructor
public class GameChatController {

    private final GameChatService chatService;

    @MessageMapping("/game/{kind}/{gameId}/chat")
    public void chat(
            @DestinationVariable String kind,
            @DestinationVariable UUID gameId,
            @Payload Map<String, String> payload,
            Principal principal) {
        UUID userId = UUID.fromString(principal.getName());
        chatService.record(kind, gameId, userId, payload.get("content"));
    }
}
