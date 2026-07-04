package com.gridclan.controller;

import com.gridclan.entity.Tournament;
import com.gridclan.repository.TournamentParticipantRepository;
import com.gridclan.repository.TournamentRepository;
import com.gridclan.service.AuditLogService;
import com.gridclan.service.LeaderboardService;
import com.gridclan.service.TournamentBracketService;
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

    private final TournamentRepository            tournamentRepo;
    private final TournamentParticipantRepository participantRepo;
    private final com.gridclan.repository.TournamentMatchRepository matchRepo;
    private final TournamentBracketService        bracketService;
    private final AuditLogService                  audit;
    private final LeaderboardService               leaderboardService;

    // ── List active / upcoming tournaments ────────────────────────────────

    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> listTournaments(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID communityId) {

        // Scoped to a community: show its UPCOMING + ACTIVE tournaments so members can join.
        if (communityId != null) {
            List<Tournament> ofCommunity = tournamentRepo
                .findByCommunityIdOrderByStartsAtDesc(communityId).stream()
                .filter(t -> !"COMPLETED".equalsIgnoreCase(t.getStatus()))
                .toList();
            return ResponseEntity.ok(ofCommunity.stream().map(this::toSummary).toList());
        }

        List<Tournament> tournaments = status != null
            ? tournamentRepo.findByStatus(status.toUpperCase())
            : tournamentRepo.findByStatus("ACTIVE");

        return ResponseEntity.ok(tournaments.stream().map(this::toSummary).toList());
    }

    // ── Get single tournament ─────────────────────────────────────────────

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> getTournament(@PathVariable UUID id, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return tournamentRepo.findById(id)
            .map(t -> {
                Map<String, Object> m = toSummary(t);
                m.put("joined",    participantRepo.existsByTournamentIdAndUserId(id, userId));
                m.put("canDelete", canManage(t, userId, auth));
                return ResponseEntity.ok(m);
            })
            .orElse(ResponseEntity.notFound().build());
    }

    // ── Delete (creator or ADMIN) ──────────────────────────────────────────

    /** DELETE /tournament/{id} — the creator or an admin removes it, along with
     *  its bracket matches and participant entries. Backing game rows are left
     *  as-is (harmless orphans once the matches referencing them are gone). */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<Map<String, String>> deleteTournament(@PathVariable UUID id, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        Tournament t = tournamentRepo.findById(id).orElse(null);
        if (t == null) return ResponseEntity.notFound().build();
        if (!canManage(t, userId, auth))
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Only the tournament's creator or an admin can delete it."));

        matchRepo.deleteByTournamentId(id);
        participantRepo.deleteByTournamentId(id);
        tournamentRepo.delete(t);
        audit.record(userId, "TOURNAMENT_DELETED", "id=" + id + " name=" + t.getName());
        return ResponseEntity.ok(Map.of("status", "DELETED"));
    }

    /** The creator (createdBy) or any admin may manage/delete a tournament. */
    private static boolean canManage(Tournament t, UUID userId, Authentication auth) {
        return userId.equals(t.getCreatedBy()) || isAdmin(auth);
    }

    private static boolean isAdmin(Authentication auth) {
        return auth.getAuthorities().stream()
            .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    // ── Join (while UPCOMING) ──────────────────────────────────────────────

    @PostMapping("/{id}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> join(@PathVariable UUID id, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        bracketService.join(userId, id);
        audit.record(userId, "TOURNAMENT_JOINED", "id=" + id);
        return ResponseEntity.ok(Map.of("tournamentId", id, "joined", true));
    }

    // ── My status: where to go (play / wait / eliminated / champion) ───────

    @GetMapping("/{id}/me")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> myStatus(@PathVariable UUID id, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        if (!tournamentRepo.existsById(id)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(bracketService.myStatus(userId, id));
    }

    // ── Bracket view ───────────────────────────────────────────────────────

    @GetMapping("/{id}/bracket")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> bracket(@PathVariable UUID id) {
        if (!tournamentRepo.existsById(id)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(bracketService.bracket(id));
    }

    // ── Create tournament (community owner / ADMIN only) ──────────────────

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<Map<String, Object>> createTournament(
            @Valid @RequestBody CreateTournamentRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        // Tournaments run on the competitive games only (no solo Word Search).
        String gameType = req.getGameType() == null ? "" : req.getGameType().trim().toUpperCase();
        if (!TournamentBracketService.GAME_KEYS.contains(gameType))
            return ResponseEntity.badRequest().body(Map.of(
                "error", "gameType must be one of SCRABBLE, GOMOKU, BATTLESHIP, CHESS, MONOPOLY"));

        // The creator picks when the tournament starts (small skew allowance so
        // "starts now" from a slow client isn't rejected). endsAt is no longer
        // user-facing: it is a force-complete backstop a week after the start.
        if (req.getStartsAt().isBefore(Instant.now().minusSeconds(120)))
            return ResponseEntity.badRequest().body(Map.of(
                "error", "startsAt must be in the future"));
        Instant endsAt = req.getEndsAt() != null
            ? req.getEndsAt()
            : req.getStartsAt().plus(java.time.Duration.ofDays(7));

        // hints_allowed is ALWAYS false for tournaments — enforced here and in DB
        Tournament t = Tournament.builder()
            .name(req.getName())
            .communityId(req.getCommunityId())
            .gameType(gameType)
            .tier("COMMUNITY_TOURNAMENT")
            .status("UPCOMING")
            .entryFeePts(req.getEntryFeePts() != null ? req.getEntryFeePts() : 0)
            .prizePoolPts(req.getPrizePoolPts() != null ? req.getPrizePoolPts() : 0L)
            .hintsAllowed(false)   // ← immutable — always false
            .maxPlayers(req.getMaxPlayers())
            .startsAt(req.getStartsAt())
            .endsAt(endsAt)
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
        m.put("currentRound", t.getCurrentRound());
        m.put("winnerId",     t.getWinnerId() != null ? t.getWinnerId().toString() : null);
        m.put("joinedCount",  participantRepo.countByTournamentId(t.getId()));
        return m;
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class CreateTournamentRequest {

        @NotBlank @Size(min = 3, max = 150)
        private String name;

        /** SCRABBLE | GOMOKU | BATTLESHIP (validated in createTournament). */
        @NotBlank
        private String gameType;

        private UUID    communityId;
        private Integer entryFeePts;
        private Long    prizePoolPts;
        private Integer maxPlayers;

        @NotNull
        private Instant startsAt;

        /** Optional — defaults to startsAt + 7 days (force-complete backstop). */
        private Instant endsAt;
    }
}
