package com.gridclan.job;

import com.gridclan.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;

/**
 * Nightly session archive job.
 *
 * Calls the archive_old_sessions() PostgreSQL procedure which:
 *   - Moves rows > 30 days old with status COMPLETED/FLAGGED/ABANDONED
 *     from active_sessions → game_sessions_archive
 *   - Runs in batches of 1000 with COMMIT between batches
 *   - Sleeps 100ms between batches to reduce I/O pressure
 *
 * Runs at 03:00 EAT (Africa/Kampala), 5 minutes after the
 * AccountDeletionService erasure job (03:00 cron overlaps —
 * both are fast; adjust offset if needed under high load).
 *
 * Timezone: Africa/Kampala is UTC+3, no DST.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ArchiveJob {

    @PersistenceContext
    private EntityManager em;

    private final AuditLogService audit;

    @Scheduled(cron = "0 5 3 * * *", zone = "Africa/Kampala")
    @Transactional
    public void archiveOldSessions() {
        log.info("Session archive job started at {}", Instant.now());
        try {
            em.createNativeQuery("CALL archive_old_sessions()").executeUpdate();
            log.info("Session archive job completed at {}", Instant.now());
            audit.record(null, "ARCHIVE_JOB_COMPLETED", "archive_old_sessions() executed");
        } catch (Exception e) {
            log.error("Session archive job failed: {}", e.getMessage(), e);
            audit.record(null, "ARCHIVE_JOB_FAILED", e.getMessage());
        }
    }

    /**
     * Partition creation job — runs on the 25th of each month at 02:00 EAT.
     * Creates the active_sessions partition for next month before it's needed.
     */
    @Scheduled(cron = "0 0 2 25 * *", zone = "Africa/Kampala")
    @Transactional
    public void createNextMonthPartition() {
        try {
            // Compute next month boundaries
            java.time.YearMonth next = java.time.YearMonth.now().plusMonths(1);
            String tableName = "active_sessions_" + next.getYear()
                + "_" + String.format("%02d", next.getMonthValue());
            String from = next.atDay(1).toString();
            String to   = next.plusMonths(1).atDay(1).toString();

            String sql = String.format(
                "CREATE TABLE IF NOT EXISTS %s PARTITION OF active_sessions " +
                "FOR VALUES FROM ('%s') TO ('%s')",
                tableName, from, to);

            em.createNativeQuery(sql).executeUpdate();
            log.info("Created partition: {}", tableName);
            audit.record(null, "PARTITION_CREATED", tableName);
        } catch (Exception e) {
            log.error("Partition creation failed: {}", e.getMessage(), e);
            audit.record(null, "PARTITION_CREATION_FAILED", e.getMessage());
        }
    }
}
