package com.gridclan.controller;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.gridscrabble.Placement;
import com.gridclan.service.ScrabbleGameService;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Grid Scrabble — async shared-board 2-player games. Create a game, share the
 * invite code, a friend joins, then players alternate moves. Server-authoritative.
 */
@RestController
@RequestMapping("/scrabble")
@RequiredArgsConstructor
public class ScrabbleController {

    private final ScrabbleGameService service;

    /** POST /scrabble — start a game; you draw the first rack and get an invite code. */
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> create(Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(auth)));
    }

    /** POST /scrabble/solo — start a game against the computer (you move first).
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

    /** POST /scrabble/{id}/hint — solo only; suggests the best word (rank-limited). */
    @PostMapping("/{id}/hint")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> hint(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.hint(userId(auth), id));
    }

    /** POST /scrabble/{code}/join — join as the opponent. */
    @PostMapping("/{code}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> join(@PathVariable String code, Authentication auth) {
        return ResponseEntity.ok(service.join(userId(auth), code));
    }

    /** GET /scrabble/{id} — current state (your rack only; opponent's is hidden). */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.get(userId(auth), id));
    }

    /** POST /scrabble/{id}/move — place tiles to form word(s). */
    @PostMapping("/{id}/move")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> move(
            @PathVariable UUID id, @Validated @RequestBody MoveRequest req, Authentication auth) {
        List<Placement> placements = new ArrayList<>();
        for (PlacementDto p : req.getPlacements()) {
            placements.add(new Placement(p.getRow(), p.getCol(), p.getLetter(), p.isBlank()));
        }
        return ResponseEntity.ok(service.move(userId(auth), id, placements));
    }

    /** POST /scrabble/{id}/pass — forfeit the turn. */
    @PostMapping("/{id}/pass")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> pass(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.pass(userId(auth), id));
    }

    /** POST /scrabble/{id}/exchange — swap some rack tiles for new ones. */
    @PostMapping("/{id}/exchange")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> exchange(
            @PathVariable UUID id, @Validated @RequestBody ExchangeRequest req, Authentication auth) {
        return ResponseEntity.ok(service.exchange(userId(auth), id, req.getTiles().toUpperCase()));
    }

    /** POST /scrabble/{id}/forfeit — concede; the opponent wins and is awarded points. */
    @PostMapping("/{id}/forfeit")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> forfeit(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.forfeit(userId(auth), id));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    // ── Request DTOs ─────────────────────────────────────────────────────────

    @Getter @Setter
    static class MoveRequest {
        @NotNull
        private List<PlacementDto> placements;
    }

    @Getter @Setter
    static class PlacementDto {
        private int row;
        private int col;
        private char letter;
        private boolean blank;
    }

    @Getter @Setter
    static class ExchangeRequest {
        @NotNull
        private String tiles;
    }
}
