package com.gridclan.repository;

import com.gridclan.entity.TournamentMatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TournamentMatchRepository extends JpaRepository<TournamentMatch, UUID> {

    List<TournamentMatch> findByTournamentIdOrderByRoundAscSlotAsc(UUID tournamentId);

    List<TournamentMatch> findByTournamentIdAndRound(UUID tournamentId, int round);

    List<TournamentMatch> findByTournamentIdAndStatus(UUID tournamentId, String status);
}
