package com.gridclan.service;

import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserSuspensionService {
    private final UserRepository  userRepo;
    private final AuditLogService audit;

    @Transactional
    public void quarantine(String userId, Duration duration, String reason) {
        try {
            UUID uid = UUID.fromString(userId);
            userRepo.findById(uid).ifPresent(user -> {
                user.setSuspended(true);
                user.setSuspensionReason(reason);
                user.setSuspensionExpiresAt(Instant.now().plus(duration));
                userRepo.save(user);
                audit.record(uid, "ACCOUNT_QUARANTINED",
                    "Duration=" + duration.toMinutes() + "m reason=" + reason);
                log.warn("Quarantined userId={} for {}m: {}", userId, duration.toMinutes(), reason);
            });
        } catch (IllegalArgumentException e) {
            log.debug("Quarantine skipped — unauthenticated request: {}", userId);
        }
    }
}
