package com.gridclan.repository;

import com.gridclan.entity.ActiveSession;
import com.gridclan.entity.ActiveSessionId;
import com.gridclan.entity.enums.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActiveSessionRepository extends JpaRepository<ActiveSession, ActiveSessionId> {
    
    // Add this method to resolve the error in UserProfileController
    List<ActiveSession> findByUserIdAndStatus(UUID userId, SessionStatus status);

    @Query("SELECT s FROM ActiveSession s WHERE s.id = :id AND s.userId = :userId")
    Optional<ActiveSession> findByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Modifying
    @Query("UPDATE ActiveSession s SET s.status = 'ABANDONED', s.completedAt = :now " +
           "WHERE s.userId = :userId AND s.status = 'ACTIVE'")
    void forfeitActiveSessions(@Param("userId") UUID userId, @Param("now") Instant now);

    /** Solo puzzles finished — for the achievements screen. */
    long countByUserIdAndGameTypeAndStatus(UUID userId, GameType gameType, SessionStatus status);

    @Query("SELECT COALESCE(MAX(s.serverScore), 0) FROM ActiveSession s " +
           "WHERE s.userId = :userId AND s.gameType = :gameType AND s.status = :status")
    int bestScore(@Param("userId") UUID userId, @Param("gameType") GameType gameType,
                  @Param("status") SessionStatus status);
}