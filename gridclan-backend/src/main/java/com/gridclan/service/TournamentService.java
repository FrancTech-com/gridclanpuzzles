package com.gridclan.service;

import com.gridclan.exception.InvalidSessionStateException;
import com.gridclan.repository.TournamentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Tournaments are ALWAYS free to enter. There is no entry fee and no
 * player-funded prize pool — entry_fee_pts is fixed at 0 by a DB CHECK
 * constraint. Prizes are gems only (platform-funded, no real-world value).
 */
@Service
@RequiredArgsConstructor
public class TournamentService {
    private final TournamentRepository tournamentRepo;

    @Transactional(readOnly = true)
    public void validateEntry(UUID userId, UUID tournamentId) {
        var t = tournamentRepo.findById(tournamentId)
            .orElseThrow(() -> new IllegalArgumentException("Tournament not found: " + tournamentId));
        if (!"ACTIVE".equals(t.getStatus()) && !"UPCOMING".equals(t.getStatus()))
            throw new InvalidSessionStateException("Tournament is not open for entry.");
        // Free entry — no fee deduction, ever.
    }
}
