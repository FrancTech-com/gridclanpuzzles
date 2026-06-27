package com.gridclan.repository;

import com.gridclan.entity.TournamentParticipant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TournamentParticipantRepository extends JpaRepository<TournamentParticipant, UUID> {

    List<TournamentParticipant> findByTournamentId(UUID tournamentId);

    Optional<TournamentParticipant> findByTournamentIdAndUserId(UUID tournamentId, UUID userId);

    long countByTournamentId(UUID tournamentId);

    boolean existsByTournamentIdAndUserId(UUID tournamentId, UUID userId);
}
