package com.gridclan.controller;

import com.gridclan.entity.FeatureFlag;
import com.gridclan.entity.User;
import com.gridclan.repository.*;
import com.gridclan.service.AuditLogService;
import com.gridclan.service.FeatureFlagService;
import com.gridclan.service.UserActivityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.*;
import org.springframework.data.domain.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository              userRepo;
    private final FlaggedEventRepository      flagRepo;
    private final AuditLogService             audit;
    private final UserActivityService         activityService;
    private final FeatureFlagService          featureFlags;

    // ── Suspend user ──────────────────────────────────────────────────────

    @PostMapping("/suspend/{userId}")
    @Transactional
    public ResponseEntity<Map<String, Object>> suspendUser(
            @PathVariable UUID userId,
            @Valid @RequestBody SuspendRequest req,
            Authentication auth) {

        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        Duration duration = Duration.ofHours(req.getDurationHours());
        user.setSuspended(true);
        user.setSuspensionReason(req.getReason());
        user.setSuspensionExpiresAt(req.isPermanent() ? null : Instant.now().plus(duration));
        user.setRefreshTokenHash(null);
        userRepo.save(user);

        String adminId = auth.getPrincipal().toString();
        audit.record(userId, "ADMIN_SUSPEND",
            "by=" + adminId + " hours=" + req.getDurationHours()
                + " permanent=" + req.isPermanent() + " reason=" + req.getReason());

        Map<String, Object> response = new HashMap<>();
        response.put("userId", userId);
        response.put("suspended", true);
        response.put("expiresAt", user.getSuspensionExpiresAt() != null 
                        ? user.getSuspensionExpiresAt().toString() : "PERMANENT");
        response.put("reason", req.getReason());

        return ResponseEntity.ok(response);
    }

    // ── Lift suspension ───────────────────────────────────────────────────

    @DeleteMapping("/suspend/{userId}")
    @Transactional
    public ResponseEntity<Map<String, String>> liftSuspension(
            @PathVariable UUID userId,
            Authentication auth) {

        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        user.setSuspended(false);
        user.setSuspensionReason(null);
        user.setSuspensionExpiresAt(null);
        userRepo.save(user);

        audit.record(userId, "ADMIN_UNSUSPEND", "by=" + auth.getPrincipal().toString());
        
        Map<String, String> response = new HashMap<>();
        response.put("status", "UNSUSPENDED");
        response.put("userId", userId.toString());
        return ResponseEntity.ok(response);
    }

    // ── Flagged events ─────────────────────────────────────────────────────

    @GetMapping("/flagged")
    public ResponseEntity<Map<String, Object>> getFlaggedEvents(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false)    String reason) {

        Pageable pageable = PageRequest.of(page, Math.min(size, 200),
            Sort.by("flaggedAt").descending());

        List<Map<String, Object>> events = flagRepo.findAll(pageable).stream()
            .filter(f -> reason == null || reason.equalsIgnoreCase(f.getReason()))
            .map(f -> {
                Map<String, Object> map = new HashMap<>();
                map.put("id", f.getId());
                map.put("userId", f.getUserId() != null ? f.getUserId().toString() : "UNKNOWN");
                map.put("sessionId", f.getSessionId() != null ? f.getSessionId().toString() : "");
                map.put("gameType", f.getGameType() != null ? f.getGameType() : "");
                map.put("reason", f.getReason());
                map.put("detail", f.getDetail() != null ? f.getDetail() : "");
                map.put("flaggedAt", f.getFlaggedAt() != null ? f.getFlaggedAt().toString() : "");
                return map;
            })
            .collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("page", page);
        response.put("size", events.size());
        response.put("events", events);

        return ResponseEntity.ok(response);
    }

    // ── Pending deletions ─────────────────────────────────────────────────

    @GetMapping("/pending-deletions")
    public ResponseEntity<List<Map<String, Object>>> getPendingDeletions() {
        Instant cutoff = Instant.now().plusSeconds(86400 * 30);
        List<Map<String, Object>> result = userRepo.findPendingDeletion(cutoff)
            .stream()
            .map(u -> {
                Map<String, Object> map = new HashMap<>();
                map.put("tombstoneId", u.getDeletionTombstoneId() != null ? u.getDeletionTombstoneId().toString() : "");
                map.put("deletionRequestedAt", u.getDeletionRequestedAt() != null ? u.getDeletionRequestedAt().toString() : "");
                map.put("countryCode", u.getCountryCode() != null ? u.getCountryCode() : "");
                return map;
            })
            .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ── User monitoring ───────────────────────────────────────────────────

    /**
     * GET /admin/metrics/users
     *
     * Returns:
     *   - totalRegistered: all non-deleted users
     *   - currentlyOnline:  users with an active Redis presence key (last 5 min)
     *   - activeToday:      users whose last_active_at is within the last 24h
     *   - activeThisWeek:   last 7 days
     *   - activeThisMonth:  last 30 days
     *   - inactive30d:      users with no activity in 30+ days
     *   - byCountry:        breakdown per country code
     */
    @GetMapping("/metrics/users")
    public ResponseEntity<Map<String, Object>> getUserMetrics() {
        Instant now      = Instant.now();
        Instant h24ago   = now.minusSeconds(86_400);
        Instant d7ago    = now.minusSeconds(86_400 * 7L);
        Instant d30ago   = now.minusSeconds(86_400 * 30L);

        long total       = userRepo.countAllActive();
        long online      = activityService.countOnlineNow();
        long activeToday = userRepo.countActiveSince(h24ago);
        long activeWeek  = userRepo.countActiveSince(d7ago);
        long activeMonth = userRepo.countActiveSince(d30ago);
        long inactive30d = userRepo.countInactiveSince(d30ago);

        Map<String, Long> byCountry = new LinkedHashMap<>();
        for (Object[] row : userRepo.countByCountry()) {
            byCountry.put((String) row[0], (Long) row[1]);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedAt",    now.toString());
        body.put("totalRegistered", total);
        body.put("currentlyOnline", online);
        body.put("activeToday",     activeToday);
        body.put("activeThisWeek",  activeWeek);
        body.put("activeThisMonth", activeMonth);
        body.put("inactive30d",     inactive30d);
        body.put("byCountry",       byCountry);

        return ResponseEntity.ok(body);
    }

    // ── Feature flags ─────────────────────────────────────────────────────

    /**
     * PUT /admin/feature-flags
     * Upserts a per-country feature flag. Takes effect immediately
     * (Redis cache is refreshed on write; otherwise 5-minute TTL).
     * Use country code 'XX' for a global flag.
     */
    @PutMapping("/feature-flags")
    public ResponseEntity<Map<String, Object>> setFeatureFlag(
            @Valid @RequestBody FeatureFlagRequest req,
            Authentication auth) {

        FeatureFlag flag = featureFlags.setFlag(
            req.getFlagName(), req.getCountryCode(), req.isEnabled(), auth.getPrincipal());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("flagName",    flag.getFlagName());
        body.put("countryCode", flag.getCountryCode());
        body.put("enabled",     flag.isEnabled());
        body.put("updatedAt",   flag.getUpdatedAt().toString());
        return ResponseEntity.ok(body);
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class SuspendRequest {
        @NotBlank private String reason;
        @NotNull private int durationHours;
        private boolean permanent;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class FeatureFlagRequest {
        @NotBlank private String flagName;
        @NotBlank @Pattern(regexp = "^[A-Z]{2}$", message = "countryCode must be 2 uppercase letters ('XX' = global)")
        private String countryCode;
        private boolean enabled;
    }
}