package com.gridclan.repository;

import com.gridclan.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    Optional<User> findByUsername(String username);
    Optional<User> findByPhoneNumber(String phone);
    Optional<User> findByDeletionTombstoneId(UUID tombstoneId);
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByPhoneNumber(String phone);

    @Query("SELECT u FROM User u WHERE u.deletionRequestedAt < :cutoff AND u.deletedAt IS NULL")
    List<User> findPendingDeletion(@Param("cutoff") Instant cutoff);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u " +
           "WHERE u.id = :id AND u.deletionRequestedAt IS NOT NULL AND u.deletedAt IS NULL")
    boolean isPendingDeletion(@Param("id") UUID id);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u " +
           "WHERE u.id = :id AND u.isSuspended = true " +
           "AND (u.suspensionExpiresAt IS NULL OR u.suspensionExpiresAt > :now)")
    boolean isSuspended(@Param("id") UUID id, @Param("now") Instant now);

    /** Current session epoch; an access token whose "tv" claim differs is revoked. */
    @Query("SELECT u.tokenVersion FROM User u WHERE u.id = :id")
    Integer tokenVersion(@Param("id") UUID id);

    // ── Monitoring queries ────────────────────────────────────────────────

    @Query("SELECT COUNT(u) FROM User u WHERE u.deletedAt IS NULL")
    long countAllActive();

    @Query("SELECT COUNT(u) FROM User u WHERE u.lastActiveAt >= :since AND u.deletedAt IS NULL")
    long countActiveSince(@Param("since") Instant since);

    @Query("SELECT COUNT(u) FROM User u WHERE " +
           "(u.lastActiveAt IS NULL OR u.lastActiveAt < :before) AND u.deletedAt IS NULL")
    long countInactiveSince(@Param("before") Instant before);

    @Query("SELECT u.countryCode, COUNT(u) FROM User u WHERE u.deletedAt IS NULL GROUP BY u.countryCode")
    List<Object[]> countByCountry();

    @Modifying
    @Query("UPDATE User u SET u.lastActiveAt = :now WHERE u.id = :id")
    void updateLastActiveAt(@Param("id") UUID id, @Param("now") Instant now);
}
