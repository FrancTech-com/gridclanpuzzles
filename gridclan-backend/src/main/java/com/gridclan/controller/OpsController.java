package com.gridclan.controller;

import com.gridclan.entity.ClientErrorEvent;
import com.gridclan.repository.ClientErrorEventRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * Ops endpoints — no ADMIN role required so the app can report crashes
 * even when the user is not authenticated, or the auth state is broken.
 *
 * POST /ops/error-report  — frontend crash / JS error report
 * GET  /ops/health        — liveness check richer than actuator (public)
 */
@RestController
@RequestMapping("/ops")
@RequiredArgsConstructor
@Slf4j
public class OpsController {

    private final ClientErrorEventRepository errorRepo;

    // ── POST /ops/error-report ────────────────────────────────────────────

    @PostMapping("/error-report")
    public ResponseEntity<Map<String, String>> receiveErrorReport(
            @Valid @RequestBody ErrorReportRequest req,
            Authentication auth) {

        UUID userId = null;
        if (auth != null && auth.getPrincipal() instanceof UUID uid) {
            userId = uid;
        }

        ClientErrorEvent event = ClientErrorEvent.builder()
                .userId(userId)
                .errorType(req.getErrorType())
                .errorMessage(req.getErrorMessage())
                .stackTrace(req.getStackTrace())
                .componentName(req.getComponentName())
                .screenName(req.getScreenName())
                .appVersion(req.getAppVersion())
                .platform(req.getPlatform())
                .deviceModel(req.getDeviceModel())
                .osVersion(req.getOsVersion())
                .extra(req.getExtra())
                .build();

        errorRepo.save(event);

        log.error("[CLIENT-ERROR] type={} screen={} userId={} msg={}",
                req.getErrorType(), req.getScreenName(), userId, req.getErrorMessage());

        return ResponseEntity.ok(Map.of("status", "RECEIVED"));
    }

    // ── GET /ops/health ───────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Instant since1h  = Instant.now().minusSeconds(3600);
        Instant since24h = Instant.now().minusSeconds(86400);

        long errors1h  = errorRepo.countSince(since1h);
        long errors24h = errorRepo.countSince(since24h);

        List<Object[]> breakdown24h = errorRepo.countByTypeSince(since24h);
        Map<String, Long> byType = new LinkedHashMap<>();
        for (Object[] row : breakdown24h) {
            byType.put((String) row[0], (Long) row[1]);
        }

        List<Map<String, Object>> recent = errorRepo
                .findByOrderByCreatedAtDesc(PageRequest.of(0, 5))
                .stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id",        e.getId());
                    m.put("type",      e.getErrorType());
                    m.put("screen",    e.getScreenName());
                    m.put("message",   e.getErrorMessage() != null
                            ? e.getErrorMessage().substring(0, Math.min(120, e.getErrorMessage().length()))
                            : "");
                    m.put("platform",  e.getPlatform());
                    m.put("createdAt", e.getCreatedAt().toString());
                    return m;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status",        "UP");
        body.put("checkedAt",     Instant.now().toString());
        body.put("clientErrors",  Map.of(
                "last1h",   errors1h,
                "last24h",  errors24h,
                "byType",   byType
        ));
        body.put("recentErrors",  recent);

        return ResponseEntity.ok(body);
    }

    // ── DTO ───────────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class ErrorReportRequest {

        @NotBlank
        @Size(max = 100)
        private String errorType;          // JS_CRASH | RENDER_ERROR | UNHANDLED_REJECTION

        @NotBlank
        @Size(max = 5000)
        private String errorMessage;

        @Size(max = 20000)
        private String stackTrace;

        @Size(max = 200)
        private String componentName;

        @Size(max = 200)
        private String screenName;

        @Size(max = 50)
        private String appVersion;

        @Size(max = 20)
        private String platform;

        @Size(max = 100)
        private String deviceModel;

        @Size(max = 50)
        private String osVersion;

        private Map<String, Object> extra;
    }
}
