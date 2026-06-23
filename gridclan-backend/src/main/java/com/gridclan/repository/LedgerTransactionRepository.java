package com.gridclan.repository;

import com.gridclan.entity.LedgerTransaction;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LedgerTransactionRepository extends JpaRepository<LedgerTransaction, UUID> {

    List<LedgerTransaction> findByUserIdOrderByCreatedAtDesc(UUID userId);

    boolean existsByReferenceIdAndType(UUID referenceId, String type);

    @Modifying
    @Query("UPDATE LedgerTransaction lt SET lt.userId = NULL, lt.tombstoneId = :tombstone " +
           "WHERE lt.userId = :userId")
    void anonymizeUserTransactions(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
