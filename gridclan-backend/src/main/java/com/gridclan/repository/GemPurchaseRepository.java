package com.gridclan.repository;

import com.gridclan.entity.GemPurchase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface GemPurchaseRepository extends JpaRepository<GemPurchase, UUID> {

    Optional<GemPurchase> findByReference(String reference);

    /** Row-locked lookup for the webhook credit path so concurrent / retried
     *  callbacks for the same reference can't double-credit. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from GemPurchase p where p.reference = :ref")
    Optional<GemPurchase> lockByReference(@Param("ref") String ref);
}
