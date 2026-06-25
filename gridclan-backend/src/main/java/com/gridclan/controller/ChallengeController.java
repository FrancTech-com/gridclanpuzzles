package com.gridclan.controller;

import com.gridclan.entity.enums.GameType;
import com.gridclan.service.ChallengeService;
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
 * Async friend challenges — create a challenge (creator plays a board), share
 * the code, a friend accepts and plays the identical board, scores are compared.
 */
@RestController
@RequestMapping("/challenge")
@RequiredArgsConstructor
public class ChallengeController {

    private final ChallengeService challengeService;

    /** POST /challenge — create a challenge and start the creator's session. */
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> create(
            @Validated @RequestBody CreateChallengeRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(challengeService.create(userId, req.getGameType()));
    }

    /** GET /challenge/{code} — current status + your next session (scores reconciled). */
    @GetMapping("/{code}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> view(
            @PathVariable String code, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(challengeService.view(userId, code));
    }

    /** POST /challenge/{code}/accept — join as the opponent and start your session. */
    @PostMapping("/{code}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> accept(
            @PathVariable String code, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(challengeService.accept(userId, code));
    }

    @Getter @Setter
    static class CreateChallengeRequest {
        @NotNull
        private GameType gameType;
    }
}
