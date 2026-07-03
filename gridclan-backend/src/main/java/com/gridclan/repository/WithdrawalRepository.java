package com.gridclan.repository;

import com.gridclan.entity.Withdrawal;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WithdrawalRepository extends JpaRepository<Withdrawal, UUID> {

    /** Row-locked lookup for the webhook settle path so concurrent / retried
     *  callbacks for the same reference can't double-refund or double-settle. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Withdrawal w where w.reference = :ref")
    Optional<Withdrawal> lockByReference(@Param("ref") String ref);

    List<Withdrawal> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}
