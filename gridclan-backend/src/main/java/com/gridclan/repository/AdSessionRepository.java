package com.gridclan.repository;

import com.gridclan.entity.AdSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdSessionRepository extends JpaRepository<AdSession, UUID> {

    /** Row-locked lookup for the completion/credit path so a double-submitted
     *  completion can't credit the same ad twice. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from AdSession s where s.id = :id")
    Optional<AdSession> lockById(@Param("id") UUID id);

    /** Ads credited since an instant — enforces the per-day earning cap. */
    long countByUserIdAndStatusAndCompletedAtAfter(UUID userId, String status, Instant after);

    /** Same cap per DEVICE across all accounts (multi-account farming). */
    long countByDeviceIdAndStatusAndCompletedAtAfter(String deviceId, String status, Instant after);

    List<AdSession> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Account erasure: RETAIN the ad-earning records (they fund payouts —
     *  part of the financial audit trail), decouple identity. */
    @Modifying
    @Query("UPDATE AdSession s SET s.userId = NULL, s.tombstoneId = :tombstone " +
           "WHERE s.userId = :userId")
    void anonymizeUserSessions(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
