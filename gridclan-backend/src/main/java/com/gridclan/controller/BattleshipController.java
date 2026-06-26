package com.gridclan.controller;

import com.gridclan.service.BattleshipGameService;
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
 * Battleship — real-time 2-player games. Create a game, share the invite code, a
 * friend joins, then players alternate firing at {row, col}. Server-authoritative;
 * a player's own ships are never sent to the opponent. Moves push live to
 * /topic/battleship/{id}.
 */
@RestController
@RequestMapping("/battleship")
@RequiredArgsConstructor
public class BattleshipController {

    private final BattleshipGameService service;

    /** POST /battleship — start a game; your fleet is placed and you fire first. */
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> create(Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(auth)));
    }

    /** POST /battleship/{code}/join — join as the opponent. */
    @PostMapping("/{code}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> join(@PathVariable String code, Authentication auth) {
        return ResponseEntity.ok(service.join(userId(auth), code));
    }

    /** GET /battleship/{id} — current state (your board + your shots only). */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.get(userId(auth), id));
    }

    /** POST /battleship/{id}/move — fire at {row, col} on the opponent's grid. */
    @PostMapping("/{id}/move")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> move(
            @PathVariable UUID id, @RequestBody FireRequest req, Authentication auth) {
        return ResponseEntity.ok(service.move(userId(auth), id, req.getRow(), req.getCol()));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    @Getter @Setter
    static class FireRequest {
        private int row;
        private int col;
    }
}
