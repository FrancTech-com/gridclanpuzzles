package com.gridclan.controller;

import com.gridclan.entity.FeatureFlag;
import com.gridclan.entity.Feedback;
import com.gridclan.entity.User;
import com.gridclan.repository.*;
import com.gridclan.service.AccountDeletionService;
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
    private final FeedbackRepository           feedbackRepo;
    private final AccountDeletionService       deletionService;
    private final GomokuGameRepository         gomokuRepo;
    private final BattleshipGameRepository     battleshipRepo;
    private final ScrabbleGameRepository       scrabbleRepo;

    /** Sentinel id of the computer opponent in solo games (mirrors the game services). */
    private static final UUID COMPUTER_ID = new UUID(0L, 0L);

    // ── Player feedback inbox (read-only, admin) ────────────────────────────

    /** GET /admin/feedback?page=0&size=20 — newest first, with unread count. */
    @GetMapping("/feedback")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> feedback(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        Page<Feedback> p = feedbackRepo.findAllByOrderByCreatedAtDesc(
            PageRequest.of(Math.max(page, 0), safeSize));

        List<Map<String, Object>> items = p.getContent().stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          f.getId());
            m.put("userId",      f.getUserId());
            m.put("displayName", f.getDisplayName() != null ? f.getDisplayName() : "Player");
            m.put("content",     f.getContent());
            m.put("handled",     f.isHandled());
            m.put("createdAt",   f.getCreatedAt().toString());
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(Map.of(
            "items",       items,
            "page",        p.getNumber(),
            "totalPages",  p.getTotalPages(),
            "totalItems",  p.getTotalElements(),
            "unhandled",   feedbackRepo.countByHandledFalse()
        ));
    }

    /** POST /admin/feedback/{id}/handled — mark a message read/done. */
    @PostMapping("/feedback/{id}/handled")
    @Transactional
    public ResponseEntity<Map<String, Object>> markFeedbackHandled(@PathVariable UUID id) {
        return feedbackRepo.findById(id).<ResponseEntity<Map<String, Object>>>map(f -> {
            f.setHandled(true);
            feedbackRepo.save(f);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("id", id);
            body.put("handled", true);
            return ResponseEntity.ok(body);
        }).orElse(ResponseEntity.notFound().build());
    }

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

    // ── Delete user (admin purge — e.g. test accounts) ────────────────────

    /**
     * DELETE /admin/users/{userId}
     * Permanently erases an account immediately (skips the 24h appeal window).
     * Reuses the standard erasure pipeline, so it's FK-safe and the account
     * disappears from every "active" list and metric. Guards: an admin can't
     * delete their own account or any other ADMIN from here.
     */
    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Map<String, Object>> deleteUser(
            @PathVariable UUID userId,
            Authentication auth) {

        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        String adminId = auth.getPrincipal().toString();
        if (userId.toString().equals(adminId)) {
            return ResponseEntity.badRequest().body(
                Map.of("error", "You can’t delete your own account from here."));
        }
        if ("ADMIN".equals(user.getRole())) {
            return ResponseEntity.badRequest().body(
                Map.of("error", "Admin accounts can’t be deleted from the dashboard."));
        }

        deletionService.adminPurge(userId);
        audit.record(userId, "ADMIN_DELETE", "by=" + adminId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", userId.toString());
        body.put("status", "DELETED");
        return ResponseEntity.ok(body);
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

    // ── User list / search ────────────────────────────────────────────────

    /**
     * GET /admin/users?query=&page=&size=
     * Paginated, searchable list of non-deleted users for the admin dashboard.
     * Search matches username / email / display name (case-insensitive).
     */
    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> listUsers(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "25") int size) {

        Pageable pageable = PageRequest.of(page, Math.min(Math.max(size, 1), 100),
            Sort.by("createdAt").descending());
        Page<User> result = userRepo.searchActive(query == null ? "" : query.trim(), pageable);

        List<Map<String, Object>> users = result.getContent().stream()
            .map(this::toUserSummary)
            .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("page",          result.getNumber());
        body.put("size",          result.getSize());
        body.put("totalElements", result.getTotalElements());
        body.put("totalPages",    result.getTotalPages());
        body.put("users",         users);
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> toUserSummary(User u) {
        Instant now = Instant.now();
        boolean activeSuspension = u.isSuspended()
            && (u.getSuspensionExpiresAt() == null || u.getSuspensionExpiresAt().isAfter(now));

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id",                  u.getId().toString());
        map.put("username",            u.getUsername());
        map.put("displayName",         u.getDisplayName());
        map.put("email",               u.getEmail());
        map.put("role",                u.getRole());
        map.put("countryCode",         u.getCountryCode());
        map.put("active",              u.isActive());
        map.put("suspended",           activeSuspension);
        map.put("suspensionReason",    u.getSuspensionReason());
        map.put("suspensionExpiresAt", u.getSuspensionExpiresAt() != null ? u.getSuspensionExpiresAt().toString() : null);
        map.put("pendingDeletion",     u.getDeletionRequestedAt() != null && u.getDeletedAt() == null);
        map.put("lastActiveAt",        u.getLastActiveAt() != null ? u.getLastActiveAt().toString() : null);
        map.put("createdAt",           u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
        return map;
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

        // Distinct human players currently sitting in a live (ACTIVE) game —
        // games still WAITING_FOR_OPPONENT don't count as "playing" yet.
        Set<UUID> playingNow = new HashSet<>();
        for (ActiveGame g : currentGames()) {
            if (!"ACTIVE".equals(g.status())) continue;
            if (g.p1() != null && !COMPUTER_ID.equals(g.p1())) playingNow.add(g.p1());
            if (g.p2() != null && !COMPUTER_ID.equals(g.p2())) playingNow.add(g.p2());
        }

        Map<String, Long> byCountry = new LinkedHashMap<>();
        for (Object[] row : userRepo.countByCountry()) {
            byCountry.put((String) row[0], (Long) row[1]);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedAt",    now.toString());
        body.put("totalRegistered", total);
        body.put("currentlyOnline", online);
        body.put("currentlyPlaying", playingNow.size());
        body.put("activeToday",     activeToday);
        body.put("activeThisWeek",  activeWeek);
        body.put("activeThisMonth", activeMonth);
        body.put("inactive30d",     inactive30d);
        body.put("byCountry",       byCountry);

        return ResponseEntity.ok(body);
    }

    // ── Live games (who's actually playing right now) ───────────────────────

    /**
     * GET /admin/live-games
     *
     * Every in-progress game across all three real-time games — both ACTIVE
     * (the two players are playing) and WAITING_FOR_OPPONENT (one player has
     * created a game and is waiting for a friend to join). ACTIVE games come
     * first, then by most-recent move. Player names are resolved in one query.
     * This is "really playing" — distinct from "online now" (an app session
     * open) or "active" (an account that isn't deleted). Refreshed by the dashboard.
     */
    @GetMapping("/live-games")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> liveGames() {
        List<ActiveGame> games = currentGames();
        // ACTIVE first, then WAITING; within each group newest move first.
        games.sort(Comparator
            .comparing((ActiveGame g) -> "ACTIVE".equals(g.status()) ? 0 : 1)
            .thenComparing(Comparator.comparing(
                ActiveGame::lastMoveAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed()));

        // Resolve every human player's display name in a single query.
        Set<UUID> ids = new HashSet<>();
        for (ActiveGame g : games) {
            if (g.p1() != null && !COMPUTER_ID.equals(g.p1())) ids.add(g.p1());
            if (g.p2() != null && !COMPUTER_ID.equals(g.p2())) ids.add(g.p2());
        }
        Map<UUID, String> names = new HashMap<>();
        for (User u : userRepo.findAllById(ids))
            names.put(u.getId(), u.getDisplayName() != null ? u.getDisplayName() : u.getUsername());

        Set<UUID> playing = new HashSet<>();
        int activeCount = 0, waitingCount = 0;
        List<Map<String, Object>> items = new ArrayList<>();
        for (ActiveGame g : games) {
            boolean active = "ACTIVE".equals(g.status());
            if (active) activeCount++; else waitingCount++;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind",       g.kind());
            m.put("gameId",     g.id().toString());
            m.put("inviteCode", g.inviteCode());
            m.put("status",     g.status());
            m.put("vsComputer", g.vsComputer());
            m.put("player1",    playerNode(g.p1(), names));
            m.put("player2",    playerNode(g.p2(), names));
            m.put("startedAt",  g.startedAt()  != null ? g.startedAt().toString()  : null);
            m.put("lastMoveAt", g.lastMoveAt() != null ? g.lastMoveAt().toString() : null);
            items.add(m);

            if (active) {  // only ACTIVE games count toward "players playing"
                if (g.p1() != null && !COMPUTER_ID.equals(g.p1())) playing.add(g.p1());
                if (g.p2() != null && !COMPUTER_ID.equals(g.p2())) playing.add(g.p2());
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedAt",    Instant.now().toString());
        body.put("count",          items.size());
        body.put("activeCount",    activeCount);
        body.put("waitingCount",   waitingCount);
        body.put("playersPlaying", playing.size());
        body.put("games",          items);
        return ResponseEntity.ok(body);
    }

    /** Normalized snapshot of one in-progress game, unifying the three game types. */
    private record ActiveGame(String kind, UUID id, String inviteCode,
                              UUID p1, UUID p2, boolean vsComputer, String status,
                              Instant startedAt, Instant lastMoveAt) {}

    /** All ACTIVE and WAITING_FOR_OPPONENT games across the three game types. */
    private List<ActiveGame> currentGames() {
        List<ActiveGame> out = new ArrayList<>();
        for (String st : List.of("ACTIVE", "WAITING_FOR_OPPONENT")) {
            gomokuRepo.findByStatus(st).forEach(g -> out.add(new ActiveGame(
                "gomoku", g.getId(), g.getInviteCode(), g.getPlayer1Id(), g.getPlayer2Id(),
                g.isVsComputer(), st, g.getCreatedAt(), g.getLastMoveAt())));
            battleshipRepo.findByStatus(st).forEach(g -> out.add(new ActiveGame(
                "battleship", g.getId(), g.getInviteCode(), g.getPlayer1Id(), g.getPlayer2Id(),
                g.isVsComputer(), st, g.getCreatedAt(), g.getLastMoveAt())));
            scrabbleRepo.findByStatus(st).forEach(g -> out.add(new ActiveGame(
                "scrabble", g.getId(), g.getInviteCode(), g.getPlayer1Id(), g.getPlayer2Id(),
                g.isVsComputer(), st, g.getCreatedAt(), g.getLastMoveAt())));
        }
        return out;
    }

    /** Player descriptor for the live-games table (null when no opponent yet). */
    private Map<String, Object> playerNode(UUID id, Map<UUID, String> names) {
        if (id == null) return null;
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("id", id.toString());
        if (COMPUTER_ID.equals(id)) {
            n.put("name", "Computer");
            n.put("computer", true);
        } else {
            n.put("name", names.getOrDefault(id, "Player"));
            n.put("computer", false);
        }
        return n;
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