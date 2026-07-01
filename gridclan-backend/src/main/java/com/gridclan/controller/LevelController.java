package com.gridclan.controller;

import com.gridclan.service.LevelService;
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
 * Difficulty-ladder progress for solo games. The level-select screen reads this
 * to draw each difficulty's unlocked levels + best scores.
 */
@RestController
@RequestMapping("/levels")
@RequiredArgsConstructor
public class LevelController {

    private final LevelService levelService;

    /**
     * GET /levels/{gameType} — ladder progress for all difficulties of a game.
     * {@code gameType} is any of the four ladder games (WORD_SEARCH, GOMOKU,
     * BATTLESHIP, SCRABBLE).
     */
    @GetMapping("/{gameType}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> getProgress(
            @PathVariable String gameType,
            Authentication auth) {
        String key = gameType == null ? "" : gameType.trim().toUpperCase();
        if (!LevelService.LADDER_GAMES.contains(key)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown game: " + gameType);
        }
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(levelService.getProgress(userId, key));
    }
}
