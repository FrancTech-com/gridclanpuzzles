package com.gridclan.controller;

import com.gridclan.dto.AdRewardRequest;
import com.gridclan.dto.GiftGemsRequest;
import com.gridclan.entity.PlayerGems;
import com.gridclan.repository.GemTransactionRepository;
import com.gridclan.service.GemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Gem endpoints. Gems are a closed-loop in-game currency with no real-world
 * value and no cashout path of any kind.
 *
 * Rate limits (enforced by RateLimitFilter):
 *   GET  /user/gems/balance    → 10 / 60s
 *   POST /user/gems/gift       →  3 / 60s
 *   POST /user/gems/ad-reward  →  5 / 300s
 */
@RestController
@RequestMapping("/user/gems")
@RequiredArgsConstructor
public class GemController {

    private final GemService                gemService;
    private final GemTransactionRepository  txRepo;

    /** GET /user/gems/balance — current balance + lifetime stats. */
    @GetMapping("/balance")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getBalance(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        PlayerGems g = gemService.getBalance(userId);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("balance",          g.getBalance());
        map.put("lifetimeEarned",   g.getLifetimeEarned());
        map.put("lifetimeGifted",   g.getLifetimeGifted());
        map.put("lifetimeReceived", g.getLifetimeReceived());
        map.put("lifetimeSpent",    g.getLifetimeSpent());
        return ResponseEntity.ok(map);
    }

    /** GET /user/gems/history — paginated gem transaction history. */
    @GetMapping("/history")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> getHistory(
            Authentication auth,
            @RequestParam(defaultValue = "50") int limit) {
        UUID userId = (UUID) auth.getPrincipal();
        int safeLimit = Math.min(limit, 200);

        List<Map<String, Object>> rows = txRepo.findByUserIdOrderByCreatedAtDesc(userId)
            .stream().limit(safeLimit).map(tx -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("type",          tx.getType());
                m.put("gemsDelta",     tx.getGemsDelta());
                m.put("balanceAfter",  tx.getBalanceAfter());
                m.put("counterpartyId", tx.getCounterpartyId());
                m.put("note",          tx.getNote());
                m.put("createdAt",     tx.getCreatedAt() != null ? tx.getCreatedAt().toString() : "");
                return m;
            }).toList();

        return ResponseEntity.ok(rows);
    }

    /** POST /user/gems/gift — gift gems to a friend (not a sale). */
    @PostMapping("/gift")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> gift(
            @Valid @RequestBody GiftGemsRequest req,
            Authentication auth) {
        UUID senderId = (UUID) auth.getPrincipal();
        gemService.giftGems(senderId, req.getRecipient(), req.getAmount(), req.getNote());
        PlayerGems g = gemService.getBalance(senderId);
        return ResponseEntity.ok(Map.of(
            "status",  "GIFT_SENT",
            "balance", g.getBalance()
        ));
    }

    /** POST /user/gems/ad-reward — claim gems from an optional rewarded ad. */
    @PostMapping("/ad-reward")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> adReward(
            @Valid @RequestBody AdRewardRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        long awarded = gemService.claimAdReward(userId, req.getAdSessionId());
        PlayerGems g = gemService.getBalance(userId);
        return ResponseEntity.ok(Map.of(
            "status",  "AD_REWARD_GRANTED",
            "awarded", awarded,
            "balance", g.getBalance()
        ));
    }
}
