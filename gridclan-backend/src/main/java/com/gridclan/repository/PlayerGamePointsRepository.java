package com.gridclan.repository;

import com.gridclan.entity.PlayerGamePoints;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlayerGamePointsRepository extends JpaRepository<PlayerGamePoints, UUID> {

    Optional<PlayerGamePoints> findByUserIdAndGameType(UUID userId, String gameType);

    /**
     * Combined leaderboard: top players by total points across all games.
     * Returns {@code Object[]{ userId (UUID), displayName (String), total (Long) }}
     * ordered high→low. Excludes inactive / suspended / pending-deletion users
     * and rows with no display name. Pass {@code PageRequest.of(0, n)} to cap.
     */
    @Query("""
        SELECT u.id, u.displayName, SUM(g.points)
        FROM PlayerGamePoints g, User u
        WHERE u.id = g.userId
          AND u.isActive = true AND u.isSuspended = false
          AND u.deletionRequestedAt IS NULL AND u.deletedAt IS NULL
          AND u.displayName IS NOT NULL
        GROUP BY u.id, u.displayName
        ORDER BY SUM(g.points) DESC
        """)
    List<Object[]> findTopByTotal(Pageable pageable);

    /**
     * Per-game breakdown for a set of users (pairs with {@link #findTopByTotal}).
     * Returns {@code Object[]{ userId (UUID), gameType (String), points (long) }}.
     */
    @Query("SELECT g.userId, g.gameType, g.points FROM PlayerGamePoints g WHERE g.userId IN :userIds")
    List<Object[]> findBreakdownForUsers(@Param("userIds") List<UUID> userIds);

    /**
     * Per-game leaderboard: top players within a single game.
     * Returns {@code Object[]{ displayName (String), points (long) }} high→low.
     */
    @Query("""
        SELECT u.displayName, g.points
        FROM PlayerGamePoints g, User u
        WHERE u.id = g.userId AND g.gameType = :gameType
          AND u.isActive = true AND u.isSuspended = false
          AND u.deletionRequestedAt IS NULL AND u.deletedAt IS NULL
          AND u.displayName IS NOT NULL
        ORDER BY g.points DESC
        """)
    List<Object[]> findTopByGame(@Param("gameType") String gameType, Pageable pageable);
}
