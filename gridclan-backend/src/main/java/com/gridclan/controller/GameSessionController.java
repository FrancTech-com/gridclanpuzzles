package com.gridclan.controller;

import com.gridclan.dto.*;
import com.gridclan.service.GameSessionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Game session endpoints.
 *
 * Rate limits enforced by RateLimitFilter (before this controller is reached):
 *   /game/session/start  → 3  / 60s
 *   /game/session/move   → 30 / 10s
 *
 * All board state is server-authoritative.
 * Client sends raw intent; server validates, applies, and returns new state.
 */
@RestController
@RequestMapping("/game/session")
@RequiredArgsConstructor
public class GameSessionController {

    private final GameSessionService sessionService;

    /** POST /game/session/start */
    @PostMapping("/start")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<SessionStartResponse> startSession(
            @Valid @RequestBody SessionStartRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(sessionService.startSession(userId, req));
    }

    /**
     * POST /game/session/move
     *
     * Client sends the raw move intent — not a computed board state.
     * Server: anti-cheat → apply move → compute score → return new board.
     * Client replaces its display state entirely with the server response.
     */
    @PostMapping("/move")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<MoveResponse> submitMove(
            @Valid @RequestBody MoveRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(sessionService.processMove(userId, req));
    }

    /**
     * POST /game/session/hint?sessionId=
     *
     * Server enforces: hintsAllowed=false for COMMUNITY_TOURNAMENT sessions.
     * Client button hiding is UX only — NOT the security boundary.
     * Gems deducted server-side BEFORE hint is returned.
     */
    @PostMapping("/hint")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<HintResponse> requestHint(
            @RequestParam UUID sessionId,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(sessionService.requestHint(userId, sessionId));
    }

    /**
     * POST /game/session/revive
     *
     * Spend gems to continue a failed solo/casual session. Server deducts
     * gems and resets the session to a playable state. Revive is DISABLED for
     * tournament sessions (competitive integrity, enforced server-side).
     */
    @PostMapping("/revive")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<MoveResponse> revive(
            @Valid @RequestBody ReviveRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(sessionService.revive(userId, req.getSessionId()));
    }

    /**
     * POST /game/session/replay
     *
     * Spend gems to replay a game with the same friend. Server deducts gems
     * and starts a fresh FRIEND-tier session.
     */
    @PostMapping("/replay")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<SessionStartResponse> replay(
            @Valid @RequestBody ReplayRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(
            sessionService.replayWithFriend(userId, req.getFriendId(), req.getGameType()));
    }
}
