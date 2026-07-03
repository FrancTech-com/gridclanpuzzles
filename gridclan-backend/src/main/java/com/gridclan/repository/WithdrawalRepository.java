package com.gridclan.repository;

import com.gridclan.entity.Withdrawal;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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

    /** Account erasure: RETAIN the payout records (incl. msisdn — required
     *  financial record under Uganda AML rules), decouple identity. */
    @Modifying
    @Query("UPDATE Withdrawal w SET w.userId = NULL, w.tombstoneId = :tombstone " +
           "WHERE w.userId = :userId")
    void anonymizeUserWithdrawals(@Param("userId") UUID userId, @Param("tombstone") UUID tombstone);
}
