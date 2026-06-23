package com.gridclan.repository;

import com.gridclan.entity.GemTransaction;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GemTransactionRepository extends JpaRepository<GemTransaction, UUID> {

    List<GemTransaction> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Idempotency check for rewarded-ad claims (reference_id = adSessionId). */
    boolean existsByReferenceIdAndType(UUID referenceId, String type);

    @Modifying
    @Query("UPDATE GemTransaction gt SET gt.userId = :tombstone WHERE gt.userId = :userId")
    void anonymizeUserTransactions(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
