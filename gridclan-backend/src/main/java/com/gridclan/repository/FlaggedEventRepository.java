package com.gridclan.repository;

import com.gridclan.entity.FlaggedEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface FlaggedEventRepository extends JpaRepository<FlaggedEvent, UUID> {

    List<FlaggedEvent> findByUserIdOrderByFlaggedAtDesc(UUID userId);

    Page<FlaggedEvent> findAll(Pageable pageable);

    Page<FlaggedEvent> findByReason(String reason, Pageable pageable);

    @Query("SELECT COUNT(f) FROM FlaggedEvent f WHERE f.userId = :userId AND f.flaggedAt > :since")
    long countRecentViolations(@Param("userId") UUID userId, @Param("since") Instant since);
}
