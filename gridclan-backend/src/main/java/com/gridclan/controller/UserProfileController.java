package com.gridclan.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.entity.User;
import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.repository.ActiveSessionRepository;
import com.gridclan.repository.BattleshipGameRepository;
import com.gridclan.repository.GomokuGameRepository;
import com.gridclan.repository.ScrabbleGameRepository;
import com.gridclan.repository.UserRepository;
import com.gridclan.service.AuditLogService;
import com.gridclan.service.RankService;
import com.gridclan.service.UserActivityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * User profile endpoints.
 *
 * GET  /user/profile         — own profile (no PII to other users)
 * PUT  /user/profile         — update display name / avatar
 * GET  /user/sessions        — recent game sessions
 */
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserProfileController {

    private final UserRepository         userRepo;
    private final ActiveSessionRepository sessionRepo;
    private final AuditLogService        audit;
    private final UserActivityService    activityService;
    private final RankService            rankService;
    private final RedisTemplate<String, String> redis;
    private final ObjectMapper           objectMapper;
    private final GomokuGameRepository     gomokuRepo;
    private final BattleshipGameRepository battleshipRepo;
    private final ScrabbleGameRepository   scrabbleRepo;

    /** Cache-aside TTL for profile reads (blueprint § Scalability). */
    private static final Duration PROFILE_CACHE_TTL = Duration.ofSeconds(60);

    /** Statuses that count as "still going" for the resume prompt. */
    private static final List<String> RESUMABLE_STATUSES = List.of("ACTIVE", "WAITING_FOR_OPPONENT");
    /** Don't offer to resume a game nobody has touched in this long. */
    private static final Duration RESUME_WINDOW = Duration.ofHours(48);

    // ── GET own profile ───────────────────────────────────────────────────

    @GetMapping("/profile")
    @PreAuthorize("hasRole('USER')")
    @Transactional(readOnly = true)   // cache miss reads the replica when configured
    public ResponseEntity<Map<String, Object>> getProfile(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        Map<String, Object> cached = readProfileCache(userId);
        if (cached != null) return ResponseEntity.ok(cached);

        return userRepo.findById(userId)
            .map(u -> {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("userId",            u.getId());
                p.put("username",          u.getUsername());
                p.put("displayName",       u.getDisplayName());
                p.put("avatarUrl",         u.getAvatarUrl());
                p.put("countryCode",       u.getCountryCode());
                p.put("emailVerified",     u.isEmailVerified());
                p.put("role",              u.getRole());
                p.put("createdAt",         u.getCreatedAt().toString());
                p.put("lastLoginAt",       u.getLastLoginAt() != null
                                             ? u.getLastLoginAt().toString() : null);
                writeProfileCache(userId, p);
                return ResponseEntity.ok(p);
            })
            .orElse(ResponseEntity.notFound().build());
    }

    // ── GET own rank (Beginner / Amateur / Professional + progress) ────────

    /**
     * GET /user/rank — the caller's progression rank, lifetime points, and
     * progress toward the next rank. Computed fresh (not cached) since points
     * change every game.
     */
    @GetMapping("/rank")
    @PreAuthorize("hasRole('USER')")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> getRank(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(rankService.summary(userId));
    }

    // ── PUT update profile ────────────────────────────────────────────────

    @PutMapping("/profile")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, Object>> updateProfile(
            @Valid @RequestBody UpdateProfileRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        User user   = userRepo.findById(userId)
            .orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        if (req.getDisplayName() != null) user.setDisplayName(req.getDisplayName());
        if (req.getAvatarUrl()   != null) user.setAvatarUrl(req.getAvatarUrl());

        userRepo.save(user);
        evictProfileCache(userId);
        audit.record(userId, "PROFILE_UPDATED", "fields=" + req.changedFields());

        return ResponseEntity.ok(Map.of(
            "status",      "UPDATED",
            "displayName", user.getDisplayName() != null ? user.getDisplayName() : "",
            "avatarUrl",   user.getAvatarUrl()   != null ? user.getAvatarUrl()   : ""
        ));
    }

    // ── Profile cache helpers (best-effort; failures fall through to DB) ──

    private Map<String, Object> readProfileCache(UUID userId) {
        try {
            String json = redis.opsForValue().get("profile:" + userId);
            return json == null ? null
                : objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return null;
        }
    }

    private void writeProfileCache(UUID userId, Map<String, Object> profile) {
        try {
            redis.opsForValue().set("profile:" + userId,
                objectMapper.writeValueAsString(profile), PROFILE_CACHE_TTL);
        } catch (Exception ignored) {}
    }

    private void evictProfileCache(UUID userId) {
        try {
            redis.delete("profile:" + userId);
        } catch (Exception ignored) {}
    }

    // ── Register / update device push token ──────────────────────────────

    @PutMapping("/device-token")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, String>> updateDeviceToken(
            @RequestBody Map<String, String> body,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        String token = body.get("deviceToken");
        if (token == null || token.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "deviceToken required"));

        userRepo.findById(userId).ifPresent(u -> {
            u.setDeviceToken(token);
            userRepo.save(u);
        });
        return ResponseEntity.ok(Map.of("status", "REGISTERED"));
    }

    // ── GET recent sessions ───────────────────────────────────────────────

    @GetMapping("/sessions")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> getMySessions(
            @RequestParam(defaultValue = "20") int limit,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        int safeLimit = Math.min(limit, 100);

        var sessions = sessionRepo
            .findByUserIdAndStatus(userId, SessionStatus.COMPLETED)
            .stream()
            .limit(safeLimit)
            .map(s -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("sessionId",  s.getId());
                m.put("gameType",   s.getGameType());
                m.put("tier",       s.getTier());
                m.put("score",      s.getServerScore());
                m.put("moves",      s.getMoveCount());
                m.put("startedAt",  s.getStartedAt().toString());
                m.put("completedAt", s.getCompletedAt() != null
                                       ? s.getCompletedAt().toString() : null);
                return m;
            })
            .toList();

        return ResponseEntity.ok(sessions);
    }

    // ── Resume an in-progress game ────────────────────────────────────────

    /**
     * GET /user/active-game
     *
     * The caller's most-recently-active unfinished game across all three
     * real-time games (ACTIVE or WAITING_FOR_OPPONENT), so the app can offer to
     * drop them straight back into it after they reopen / log back in. Returns
     * 204 No Content when there's nothing recent to resume.
     */
    @GetMapping("/active-game")
    @PreAuthorize("hasRole('USER')")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> activeGame(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        Instant cutoff = Instant.now().minus(RESUME_WINDOW);

        record Resume(String kind, UUID id, String status, boolean vsComputer, Instant lastMoveAt) {}
        List<Resume> candidates = new ArrayList<>();
        gomokuRepo.findResumable(userId, RESUMABLE_STATUSES).stream().findFirst()
            .ifPresent(g -> candidates.add(new Resume("gomoku", g.getId(), g.getStatus(), g.isVsComputer(), g.getLastMoveAt())));
        battleshipRepo.findResumable(userId, RESUMABLE_STATUSES).stream().findFirst()
            .ifPresent(g -> candidates.add(new Resume("battleship", g.getId(), g.getStatus(), g.isVsComputer(), g.getLastMoveAt())));
        scrabbleRepo.findResumable(userId, RESUMABLE_STATUSES).stream().findFirst()
            .ifPresent(g -> candidates.add(new Resume("scrabble", g.getId(), g.getStatus(), g.isVsComputer(), g.getLastMoveAt())));

        Resume best = candidates.stream()
            .filter(r -> r.lastMoveAt() != null && r.lastMoveAt().isAfter(cutoff))
            .max(Comparator.comparing(Resume::lastMoveAt))
            .orElse(null);
        if (best == null) return ResponseEntity.noContent().build();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kind",       best.kind());
        body.put("gameId",     best.id().toString());
        body.put("status",     best.status());
        body.put("vsComputer", best.vsComputer());
        body.put("lastMoveAt", best.lastMoveAt() != null ? best.lastMoveAt().toString() : null);
        return ResponseEntity.ok(body);
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────

    /**
     * POST /user/heartbeat
     *
     * Called by the mobile app every 60 seconds while foregrounded.
     * Updates Redis presence (used for "currently online" counter) and
     * debounces DB last_active_at writes to every 5 minutes.
     */
    @PostMapping("/heartbeat")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<Map<String, String>> heartbeat(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        activityService.recordHeartbeat(userId);
        return ResponseEntity.ok(Map.of("status", "OK"));
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class UpdateProfileRequest {

        @Size(min = 1, max = 64, message = "Display name must be 1–64 chars")
        private String displayName;

        @Size(max = 500)
        private String avatarUrl;

        String changedFields() {
            List<String> changed = new ArrayList<>();
            if (displayName != null) changed.add("displayName");
            if (avatarUrl   != null) changed.add("avatarUrl");
            return String.join(",", changed);
        }
    }
}
