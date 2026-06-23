package com.gridclan.service;

import com.gridclan.entity.AuditLog;
import com.gridclan.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogService {
    private final AuditLogRepository auditRepo;

    @Transactional
    public void record(UUID userId, String eventType, String detail) {
        try {
            auditRepo.save(AuditLog.builder()
                .userId(userId).eventType(eventType)
                .detail(detail).createdAt(Instant.now()).build());
        } catch (Exception e) {
            log.error("Audit log write failed: userId={} event={} err={}", userId, eventType, e.getMessage());
        }
    }
}
