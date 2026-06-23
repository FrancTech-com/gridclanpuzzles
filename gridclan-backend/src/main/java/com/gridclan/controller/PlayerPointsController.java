package com.gridclan.controller;

import com.gridclan.entity.LedgerTransaction;
import com.gridclan.repository.LedgerTransactionRepository;
import com.gridclan.repository.PlayerPointsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Player points endpoints.
 *
 * Points are a PURE score / leaderboard / progression metric. They have NO
 * monetary value, NO spending function, and NO conversion path of any kind.
 * In-game spending happens with gems instead (see GemController).
 *
 * Rate limits (enforced by RateLimitFilter):
 *   GET /user/points/balance → 10 / 60s
 */
@RestController
@RequestMapping("/user/points")
@RequiredArgsConstructor
public class PlayerPointsController {

    private final PlayerPointsRepository      pointsRepo;
    private final LedgerTransactionRepository ledgerRepo;

    /**
     * GET /user/points/balance
     * Current score balance + lifetime totals. Rate-limited to 10/60s.
     */
    @GetMapping("/balance")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getBalance(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        return pointsRepo.findByUserId(userId)
            .map(p -> {
                Map<String, Object> map = new HashMap<>();
                map.put("balance",        p.getBalance());
                map.put("lifetimeEarned", p.getLifetimeEarned());
                map.put("lifetimeSpent",  p.getLifetimeSpent());
                map.put("updatedAt",      p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : "");
                return ResponseEntity.ok(map);
            })
            .orElseGet(() -> {
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("balance", 0L);
                return ResponseEntity.ok(fallback);
            });
    }

    /**
     * GET /user/points/history?limit=50
     * Paginated points-ledger history for the authenticated user.
     */
    @GetMapping("/history")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> getHistory(
            Authentication auth,
            @RequestParam(defaultValue = "50") int limit) {
        UUID userId = (UUID) auth.getPrincipal();
        int safeLimit = Math.min(limit, 200);

        List<LedgerTransaction> rows = ledgerRepo
            .findByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .limit(safeLimit)
            .toList();

        List<Map<String, Object>> response = rows.stream().map(tx -> {
            Map<String, Object> map = new HashMap<>();
            map.put("type",          tx.getType());
            map.put("pointsDelta",   tx.getPointsDelta());
            map.put("balanceAfter",  tx.getBalanceAfter());
            map.put("status",        tx.getStatus());
            map.put("createdAt",     tx.getCreatedAt() != null ? tx.getCreatedAt().toString() : "");
            return map;
        }).toList();

        return ResponseEntity.ok(response);
    }
}
