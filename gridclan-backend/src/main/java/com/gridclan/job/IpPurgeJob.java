package com.gridclan.job;

import com.gridclan.repository.AuditLogRepository;
import com.gridclan.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * GDPR IP-address retention job.
 *
 * IP addresses are stored only in audit_log and must be purged after 90 days
 * (blueprint § GDPR data retention). The audit rows themselves are kept for
 * the 7-year AML window — this job only NULLs the ip_address column.
 *
 * Runs nightly at 03:30 EAT (Africa/Kampala), after the deletion/archive jobs.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class IpPurgeJob {

    private final AuditLogRepository auditRepo;
    private final AuditLogService    audit;

    private static final int RETENTION_DAYS = 90;

    @Scheduled(cron = "0 30 3 * * *", zone = "Africa/Kampala")
    @Transactional
    public void purgeOldIpAddresses() {
        Instant cutoff = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        try {
            int purged = auditRepo.purgeIpAddressesOlderThan(cutoff);
            log.info("IP purge job complete: {} audit rows had ip_address cleared (>{}d old)",
                purged, RETENTION_DAYS);
            audit.record(null, "IP_PURGE_COMPLETED", "rowsCleared=" + purged);
        } catch (Exception e) {
            log.error("IP purge job failed: {}", e.getMessage(), e);
            audit.record(null, "IP_PURGE_FAILED", e.getMessage());
        }
    }
}
