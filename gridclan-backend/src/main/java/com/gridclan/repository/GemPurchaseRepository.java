package com.gridclan.repository;

import com.gridclan.entity.GemPurchase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GemPurchaseRepository extends JpaRepository<GemPurchase, UUID> {

    Optional<GemPurchase> findByReference(String reference);

    /** Row-locked lookup for the webhook credit path so concurrent / retried
     *  callbacks for the same reference can't double-credit. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from GemPurchase p where p.reference = :ref")
    Optional<GemPurchase> lockByReference(@Param("ref") String ref);

    List<GemPurchase> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Account erasure: RETAIN the purchase records (incl. msisdn — required
     *  financial record under Uganda AML rules), decouple identity. */
    @Modifying
    @Query("UPDATE GemPurchase p SET p.userId = NULL, p.tombstoneId = :tombstone " +
           "WHERE p.userId = :userId")
    void anonymizeUserPurchases(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
