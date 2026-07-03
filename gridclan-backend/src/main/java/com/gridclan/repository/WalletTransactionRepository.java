package com.gridclan.repository;

import com.gridclan.entity.WalletTransaction;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {

    List<WalletTransaction> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** Account erasure: RETAIN the financial audit rows, decouple identity. */
    @Modifying
    @Query("UPDATE WalletTransaction t SET t.userId = NULL, t.tombstoneId = :tombstone " +
           "WHERE t.userId = :userId")
    void anonymizeUserTransactions(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
