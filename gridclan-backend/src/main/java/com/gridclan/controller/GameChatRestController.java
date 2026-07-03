package com.gridclan.controller;

import com.gridclan.service.GameChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST side of in-game chat (safe path).
 *
 * GET  /game-chat/{kind}/{gameId} — last messages, oldest→newest. Loads history
 *      on entering a game and backs the 4s polling fallback, so chat works even
 *      when the WebSocket can't connect (same pattern as game-move polling).
 * POST /game-chat/{kind}/{gameId} — send reliably; also broadcast on the topic.
 *
 * Clients dedupe by message id, so the WS fast path and this path can overlap.
 */
@RestController
@RequestMapping("/game-chat")
@RequiredArgsConstructor
public class GameChatRestController {

    private final GameChatService chatService;

    @GetMapping("/{kind}/{gameId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> history(
            @PathVariable String kind, @PathVariable UUID gameId, Authentication auth) {
        return ResponseEntity.ok(chatService.history(kind, gameId, (UUID) auth.getPrincipal()));
    }

    @PostMapping("/{kind}/{gameId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> send(
            @PathVariable String kind, @PathVariable UUID gameId,
            @RequestBody Map<String, String> body, Authentication auth) {
        Map<String, Object> saved =
            chatService.record(kind, gameId, (UUID) auth.getPrincipal(), body.get("content"));
        if (saved == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "You are not a player of this game, or the message was empty.");
        }
        return ResponseEntity.ok(saved);
    }
}
