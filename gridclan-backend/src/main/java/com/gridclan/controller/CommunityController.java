package com.gridclan.controller;

import com.gridclan.entity.Community;
import com.gridclan.entity.CommunityMember;
import com.gridclan.repository.CommunityMemberRepository;
import com.gridclan.repository.CommunityRepository;
import com.gridclan.service.AuditLogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import org.springframework.data.domain.PageRequest;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Community management endpoints.
 *
 * /community/chat is rate-limited to 5/3s by RateLimitFilter (anti-spam).
 * Community tournament entry is handled via GameSessionService.startSession().
 */
@RestController
@RequestMapping("/community")
@RequiredArgsConstructor
@Slf4j
public class CommunityController {

    private final CommunityRepository       communityRepo;
    private final CommunityMemberRepository memberRepo;
    private final AuditLogService           audit;

    // ── List communities ──────────────────────────────────────────────────

    /**
     * GET /community?page=0&size=20
     * Active communities ordered by member count, with the caller's
     * membership flagged so the client can show Join vs Open chat.
     * Pagination per blueprint § API scalability: default 20, max 100.
     */
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> listCommunities(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        int safeSize = Math.min(Math.max(size, 1), 100);

        Set<UUID> myCommunityIds =
            new HashSet<>(communityRepo.findCommunityIdsByMember(userId));

        List<Map<String, Object>> response = communityRepo
            .findByIsActiveTrueOrderByMemberCountDesc(
                PageRequest.of(Math.max(page, 0), safeSize))
            .stream()
            .map(c -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id",            c.getId());
                m.put("name",          c.getName());
                m.put("description",   c.getDescription());
                m.put("memberCount",   c.getMemberCount());
                m.put("weeklyPoolPts", c.getWeeklyPoolPts());
                m.put("isActive",      c.isActive());
                m.put("isMember",      myCommunityIds.contains(c.getId()));
                m.put("createdAt",     c.getCreatedAt().toString());
                return m;
            })
            .toList();

        return ResponseEntity.ok(response);
    }

    // ── Create community ──────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, Object>> createCommunity(
            @Valid @RequestBody CreateCommunityRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        if (communityRepo.existsByName(req.getName())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Community name already taken."));
        }

        Community community = Community.builder()
            .name(req.getName())
            .description(req.getDescription())
            .ownerId(userId)
            .build();
        communityRepo.save(community);

        // Owner is automatically a member
        memberRepo.save(CommunityMember.builder()
            .communityId(community.getId())
            .userId(userId)
            .role("OWNER")
            .build());

        audit.record(userId, "COMMUNITY_CREATED", "id=" + community.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
            "communityId", community.getId(),
            "name",        community.getName()
        ));
    }

    // ── Join community ────────────────────────────────────────────────────

    @PostMapping("/{communityId}/join")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, String>> joinCommunity(
            @PathVariable UUID communityId,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        if (!communityRepo.existsById(communityId)) {
            return ResponseEntity.notFound().build();
        }
        if (memberRepo.findByCommunityIdAndUserId(communityId, userId).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Already a member."));
        }

        memberRepo.save(CommunityMember.builder()
            .communityId(communityId)
            .userId(userId)
            .role("MEMBER")
            .build());

        return ResponseEntity.ok(Map.of("status", "JOINED"));
    }

    // ── Leave community ───────────────────────────────────────────────────

    @DeleteMapping("/{communityId}/leave")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, String>> leaveCommunity(
            @PathVariable UUID communityId,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        memberRepo.findByCommunityIdAndUserId(communityId, userId)
            .ifPresent(m -> memberRepo.delete(m));

        return ResponseEntity.ok(Map.of("status", "LEFT"));
    }

    /**
     * POST /community/chat
     * Legacy HTTP endpoint — kept for REST clients and load testing.
     * Real-time chat: WebSocket STOMP at /ws → /app/community/{id}/chat
     * See ChatController for the live implementation.
     */
    @PostMapping("/chat")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, String>> chatHttp(
            @RequestBody Map<String, String> payload,
            Authentication auth) {
        return ResponseEntity.accepted().body(Map.of(
            "status",  "USE_WEBSOCKET",
            "message", "Connect to wss://api.gridclanpuzzle.win/ws for real-time chat. " +
                       "Subscribe to /topic/community/{communityId}."
        ));
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class CreateCommunityRequest {

        @NotBlank
        @Size(min = 3, max = 100)
        private String name;

        @Size(max = 500)
        private String description;
    }
}
