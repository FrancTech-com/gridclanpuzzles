package com.gridclan.repository;

import com.gridclan.entity.Tournament;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface TournamentRepository extends JpaRepository<Tournament, UUID> {

    // This method is required by TournamentController to find tournaments by status
    List<Tournament> findByStatus(String status);

    /** UPCOMING tournaments whose start time has arrived (scheduler → start). */
    List<Tournament> findByStatusAndStartsAtBefore(String status, Instant when);

    /** Tournaments belonging to a community (newest first). */
    List<Tournament> findByCommunityIdOrderByStartsAtDesc(UUID communityId);

    @Modifying
    @Query(value = "DELETE FROM tournament_participants WHERE user_id = :userId", nativeQuery = true)
    void removeParticipant(@Param("userId") UUID userId);
}