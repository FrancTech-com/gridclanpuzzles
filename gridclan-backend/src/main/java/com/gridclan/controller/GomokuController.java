package com.gridclan.controller;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.service.GomokuGameService;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Gomoku — real-time shared-board 2-player games. Create a game, share the invite
 * code, a friend joins, then players alternate placing stones. Server-authoritative;
 * moves are pushed live to /topic/gomoku/{id}.
 */
@RestController
@RequestMapping("/gomoku")
@RequiredArgsConstructor
public class GomokuController {

    private final GomokuGameService service;

    /** POST /gomoku — start a game; you play first and get an invite code. */
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> create(Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(auth)));
    }

    /** POST /gomoku/solo — start a game against the computer (you move first).
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

    /** POST /gomoku/{id}/hint — solo only; highlights a suggested square (rank-limited). */
    @PostMapping("/{id}/hint")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> hint(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.hint(userId(auth), id));
    }

    /** POST /gomoku/{id}/revive — solo only; spend gems to undo a loss and play on. */
    @PostMapping("/{id}/revive")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> revive(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.revive(userId(auth), id));
    }

    /** POST /gomoku/{code}/join — join as the opponent. */
    @PostMapping("/{code}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> join(@PathVariable String code, Authentication auth) {
        return ResponseEntity.ok(service.join(userId(auth), code));
    }

    /** GET /gomoku/{id} — current state. */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.get(userId(auth), id));
    }

    /** POST /gomoku/{id}/move — place a stone at {row, col}. */
    @PostMapping("/{id}/move")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> move(
            @PathVariable UUID id, @RequestBody MoveRequest req, Authentication auth) {
        return ResponseEntity.ok(service.move(userId(auth), id, req.getRow(), req.getCol()));
    }

    /** POST /gomoku/{id}/forfeit — concede; the opponent wins and is awarded points. */
    @PostMapping("/{id}/forfeit")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> forfeit(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.forfeit(userId(auth), id));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    @Getter @Setter
    static class MoveRequest {
        private int row;
        private int col;
    }
}
