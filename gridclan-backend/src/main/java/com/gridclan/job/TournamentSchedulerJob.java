package com.gridclan.job;

import com.gridclan.entity.Tournament;
import com.gridclan.repository.TournamentRepository;
import com.gridclan.service.TournamentBracketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Drives the tournament lifecycle every minute:
 *   - UPCOMING whose startsAt has passed  → start (seed bracket / cancel if <2)
 *   - ACTIVE                              → reconcile finished matches / advance
 *   - ACTIVE past endsAt                  → force-complete to a champion
 *
 * Each tournament is handled in its own try/catch so one bad row can't stall
 * the rest. Bracket mutations are transactional inside TournamentBracketService.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TournamentSchedulerJob {

    private final TournamentRepository    tournamentRepo;
    private final TournamentBracketService bracket;

    @Scheduled(fixedDelay = 60_000, initialDelay = 20_000)
    public void tick() {
        Instant now = Instant.now();

        // 1. Start due tournaments.
        for (Tournament t : tournamentRepo.findByStatusAndStartsAtBefore("UPCOMING", now)) {
            try { bracket.start(t); }
            catch (Exception e) { log.error("Tournament start failed: {}", t.getId(), e); }
        }

        // 2. Advance / complete active tournaments.
        for (Tournament t : tournamentRepo.findByStatus("ACTIVE")) {
            try {
                if (t.getEndsAt() != null && t.getEndsAt().isBefore(now)) bracket.forceComplete(t);
                else                                                      bracket.reconcile(t);
            } catch (Exception e) {
                log.error("Tournament reconcile failed: {}", t.getId(), e);
            }
        }
    }
}
