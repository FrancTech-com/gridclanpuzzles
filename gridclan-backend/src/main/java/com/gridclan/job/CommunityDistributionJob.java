package com.gridclan.job;

import com.gridclan.repository.CommunityMemberRepository;
import com.gridclan.repository.CommunityRepository;
import com.gridclan.service.PlayerPointsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Weekly community points distribution job.
 *
 * Runs every Monday at 00:00 EAT (Africa/Kampala).
 * Processes 500 members per batch with its own short transaction.
 * 100ms pause between batches reduces DB I/O pressure and table lock time.
 *
 * Points are a pure progression metric with no monetary value, so there is
 * NO fee of any kind. The full weekly pool is split among active members.
 *
 * Distribution formula:
 *   gross = community.weekly_pool_pts
 *   share = gross / active_member_count   (integer division; remainder stays in pool)
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CommunityDistributionJob {

    private final CommunityRepository       communityRepo;
    private final CommunityMemberRepository memberRepo;
    private final PlayerPointsService       pointsService;

    private static final int BATCH_SIZE = 500;

    @Scheduled(cron = "0 0 0 * * MON", zone = "Africa/Kampala")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void distributeWeeklyPoints() {
        log.info("Weekly community distribution job started");
        communityRepo.findAllWithPositivePool()
            .forEach(this::distributeForCommunity);
        log.info("Weekly community distribution job completed");
    }

    private void distributeForCommunity(com.gridclan.entity.Community community) {
        long gross = community.getWeeklyPoolPts();
        if (gross <= 0) return;

        long memberCount = memberRepo.countActiveMembers(community.getId());
        if (memberCount == 0) return;

        long share = gross / memberCount;  // Integer division; remainder stays
        if (share == 0) return;

        log.info("Distributing community={} gross={} share={} members={}",
            community.getId(), gross, share, memberCount);

        int page = 0;
        while (true) {
            List<UUID> batch = memberRepo.findActiveMemberIds(
                community.getId(), PageRequest.of(page, BATCH_SIZE));
            if (batch.isEmpty()) break;

            processBatch(community.getId(), batch, share);
            page++;

            // 100ms pause between batches — reduce I/O pressure
            try { Thread.sleep(100); } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        communityRepo.resetWeeklyPool(community.getId(), Instant.now());
    }

    /**
     * Own @Transactional per batch — one member failure cannot abort the batch.
     * READ_COMMITTED is sufficient here; pessimistic lock is inside PlayerPointsService.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void processBatch(UUID communityId, List<UUID> memberIds, long share) {
        for (UUID memberId : memberIds) {
            try {
                pointsService.creditCommunityShare(memberId, share, communityId);
            } catch (Exception e) {
                log.error("Distribution failed for member={}: {}", memberId, e.getMessage());
                // Log and continue — one failure must not block the entire batch
            }
        }
    }
}
