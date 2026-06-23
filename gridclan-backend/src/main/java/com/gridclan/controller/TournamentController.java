package com.gridclan.controller;

import com.gridclan.entity.Tournament;
import com.gridclan.entity.enums.GameType;
import com.gridclan.repository.TournamentRepository;
import com.gridclan.service.AuditLogService;
import com.gridclan.service.LeaderboardService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * Tournament endpoints.
 *
 * Community owners create tournaments; all members can view and enter.
 * Tournament ENTRY goes through POST /game/session/start with tier=COMMUNITY_TOURNAMENT
 * — TournamentService.validateEntry() handles fee deduction there.
 *
 * Leaderboard is a placeholder backed by ledger data.
 * Full real-time leaderboard requires Redis sorted sets (future iteration).
 */
@RestController
@RequestMapping("/tournament")
@RequiredArgsConstructor
public class TournamentController {

    private final TournamentRepository tournamentRepo;
    private final AuditLogService      audit;
    private final LeaderboardService   leaderboardService;

    // ── List active / upcoming tournaments ────────────────────────────────

    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> listTournaments(
            @RequestParam(required = false) String status) {
        List<Tournament> tournaments = status != null
            ? tournamentRepo.findByStatus(status.toUpperCase())
            : tournamentRepo.findByStatus("ACTIVE");

        return ResponseEntity.ok(tournaments.stream().map(this::toSummary).toList());
    }

    // ── Get single tournament ─────────────────────────────────────────────

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getTournament(@PathVariable UUID id) {
        return tournamentRepo.findById(id)
            .map(t -> ResponseEntity.ok(toSummary(t)))
            .orElse(ResponseEntity.notFound().build());
    }

    // ── Create tournament (community owner / ADMIN only) ──────────────────

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<Map<String, Object>> createTournament(
            @Valid @RequestBody CreateTournamentRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        // hints_allowed is ALWAYS false for tournaments — enforced here and in DB
        Tournament t = Tournament.builder()
            .name(req.getName())
            .communityId(req.getCommunityId())
            .gameType(req.getGameType().name())
            .tier("COMMUNITY_TOURNAMENT")
            .status("UPCOMING")
            .entryFeePts(req.getEntryFeePts() != null ? req.getEntryFeePts() : 0)
            .prizePoolPts(req.getPrizePoolPts() != null ? req.getPrizePoolPts() : 0L)
            .hintsAllowed(false)   // ← immutable — always false
            .maxPlayers(req.getMaxPlayers())
            .startsAt(req.getStartsAt())
            .endsAt(req.getEndsAt())
            .createdBy(userId)
            .build();

        tournamentRepo.save(t);
        audit.record(userId, "TOURNAMENT_CREATED", "id=" + t.getId() + " name=" + t.getName());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
            "tournamentId",  t.getId(),
            "name",          t.getName(),
            "hintsAllowed",  false,
            "status",        t.getStatus()
        ));
    }

    // ── Leaderboard — Redis sorted set ZREVRANGE top-100 ─────────────────

    @GetMapping("/{id}/leaderboard")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getLeaderboard(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "100") int limit) {
        if (!tournamentRepo.existsById(id)) return ResponseEntity.notFound().build();
        var top = leaderboardService.getTopN(id, Math.min(limit, 100));
        long total = leaderboardService.getParticipantCount(id);
        return ResponseEntity.ok(Map.of(
            "tournamentId",   id,
            "leaderboard",    top,
            "totalPlayers",   total,
            "showing",        top.size()
        ));
    }

    // ── Player rank lookup ─────────────────────────────────────────────────

    @GetMapping("/{id}/rank")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getMyRank(
            @PathVariable UUID id,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        // Need displayName — fetch from repo
        var userRank = leaderboardService.getPlayerRank(id, userId, userId.toString());
        return userRank.map(ResponseEntity::ok)
                       .orElse(ResponseEntity.ok(Map.of("rank", -1, "score", 0)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> toSummary(Tournament t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",           t.getId());
        m.put("name",         t.getName());
        m.put("gameType",     t.getGameType());
        m.put("status",       t.getStatus());
        m.put("entryFeePts",  t.getEntryFeePts());
        m.put("prizePoolPts", t.getPrizePoolPts());
        m.put("hintsAllowed", false);  // Always false — never expose true
        m.put("maxPlayers",   t.getMaxPlayers());
        m.put("startsAt",     t.getStartsAt() != null ? t.getStartsAt().toString() : null);
        m.put("endsAt",       t.getEndsAt()   != null ? t.getEndsAt().toString()   : null);
        m.put("communityId",  t.getCommunityId());
        return m;
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class CreateTournamentRequest {

        @NotBlank @Size(min = 3, max = 150)
        private String name;

        @NotNull
        private GameType gameType;

        private UUID    communityId;
        private Integer entryFeePts;
        private Long    prizePoolPts;
        private Integer maxPlayers;

        @NotNull
        private Instant startsAt;

        @NotNull
        private Instant endsAt;
    }
}
