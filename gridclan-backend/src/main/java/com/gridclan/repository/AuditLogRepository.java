package com.gridclan.repository;

import com.gridclan.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    /**
     * GDPR data-retention: IP addresses are kept for 90 days then purged.
     * The audit row itself is RETAINED (7-year AML/compliance retention) —
     * we only NULL the ip_address column. This is an UPDATE, not a DELETE,
     * which also respects the "no DELETE on audit_log" grant rule.
     */
    @Modifying
    @Query("UPDATE AuditLog a SET a.ipAddress = NULL " +
           "WHERE a.createdAt < :cutoff AND a.ipAddress IS NOT NULL")
    int purgeIpAddressesOlderThan(@Param("cutoff") Instant cutoff);
}
