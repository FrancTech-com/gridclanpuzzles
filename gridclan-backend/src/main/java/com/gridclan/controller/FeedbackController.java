package com.gridclan.controller;

import com.gridclan.entity.Feedback;
import com.gridclan.repository.FeedbackRepository;
import com.gridclan.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * In-app feedback submission.
 *
 * POST /feedback  — a player sends a comment about the app/games. It is stored
 * and read ONLY on the admin dashboard (GET /admin/feedback); it is never shown
 * to other users. Rate-limited to one message / 20s to deter spam.
 */
@RestController
@RequestMapping("/feedback")
@RequiredArgsConstructor
@Slf4j
public class FeedbackController {

    private final FeedbackRepository feedbackRepo;
    private final UserRepository     userRepo;
    private final RedisTemplate<String, String> redis;

    private static final int RATE_SECONDS = 20;

    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, String>> submit(
            @Valid @RequestBody FeedbackRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        String key = "feedback:rl:" + userId;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) redis.expire(key, Duration.ofSeconds(RATE_SECONDS));
        if (count != null && count > 1) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("error", "Please wait a moment before sending more feedback."));
        }

        String name = userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");

        feedbackRepo.save(Feedback.builder()
            .userId(userId)
            .displayName(name)
            .content(req.getContent().trim())
            .build());

        log.info("Feedback received from userId={}", userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("status", "RECEIVED"));
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    static class FeedbackRequest {
        @NotBlank
        @Size(max = 2000, message = "Feedback is too long (max 2000 chars).")
        private String content;
    }
}
