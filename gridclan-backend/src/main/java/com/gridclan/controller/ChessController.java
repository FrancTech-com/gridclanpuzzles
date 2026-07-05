package com.gridclan.controller;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.service.ChessGameService;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Chess — real-time 2-player games. Create a game, share the invite code, a
 * friend joins as black, then play. Server-authoritative (full chess rules).
 */
@RestController
@RequestMapping("/chess")
@RequiredArgsConstructor
public class ChessController {

    private final ChessGameService service;

    /** POST /chess — start a game as white; share the invite code. */
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> create(Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(auth)));
    }

    /** POST /chess/solo — start a game vs the computer (you play white, move first).
     *  Optional difficulty + level pick the AI strength / points and gate the ladder. */
    @PostMapping("/solo")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> solo(
            @RequestParam(required = false) Difficulty difficulty,
            @RequestParam(defaultValue = "1") int level,
            Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(service.createSolo(userId(auth), difficulty, level));
    }

    /** POST /chess/{code}/join — join as black. */
    @PostMapping("/{code}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> join(@PathVariable String code, Authentication auth) {
        return ResponseEntity.ok(service.join(userId(auth), code));
    }

    /** GET /chess/{id} — current state (board, legal moves on your turn). */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.get(userId(auth), id));
    }

    /** POST /chess/{id}/move — play a move ("e2e4"; promotions "e7e8q"). */
    @PostMapping("/{id}/move")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> move(
            @PathVariable UUID id, @Validated @RequestBody MoveRequest req, Authentication auth) {
        return ResponseEntity.ok(service.move(userId(auth), id, req.getMove()));
    }

    /** POST /chess/{id}/forfeit — resign; the opponent wins. */
    @PostMapping("/{id}/forfeit")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> forfeit(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.forfeit(userId(auth), id));
    }

    /** POST /chess/{id}/pause — freeze the move clock. */
    @PostMapping("/{id}/pause")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> pause(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.pause(userId(auth), id));
    }

    /** POST /chess/{id}/resume — resume play. */
    @PostMapping("/{id}/resume")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> resume(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.resume(userId(auth), id));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    @Getter @Setter
    static class MoveRequest {
        @NotNull
        private String move;
    }
}
