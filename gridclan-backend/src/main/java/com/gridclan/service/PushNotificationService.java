package com.gridclan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Firebase Cloud Messaging (FCM) push notification service.
 *
 * Used to notify players of:
 *   - Tournament start (game_type, starts_in_minutes)
 *   - Weekly community distribution credited
 *   - Account suspension/reinstatement
 *
 * Device tokens are stored in users.device_token.
 * Registered via PUT /user/device-token (UserProfileController).
 * Erased during GDPR deletion (Phase 2 — PII wipe).
 *
 * Auth: FCM v1 API uses OAuth2 server key (set FCM_SERVER_KEY env var).
 * Failures are non-fatal — all sends are @Async and swallow exceptions.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushNotificationService {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${gridclan.fcm.server-key:}")
    private String fcmServerKey;

    @Value("${gridclan.fcm.project-id:gridclan-app}")
    private String projectId;

    private static final String FCM_URL =
        "https://fcm.googleapis.com/fcm/send";

    // ── Tournament starting soon ──────────────────────────────────────────

    @Async
    public void notifyTournamentStarting(String deviceToken, String tournamentName,
                                          String gameType, int minutesUntilStart) {
        if (!isValid(deviceToken)) return;
        send(deviceToken,
            "Tournament starting soon!",
            tournamentName + " (" + gameType + ") starts in " + minutesUntilStart + " min",
            Map.of("type", "TOURNAMENT_START", "gameType", gameType));
    }

    // ── Community points credited ─────────────────────────────────────────

    @Async
    public void notifyPointsCredited(String deviceToken, long points, String reason) {
        if (!isValid(deviceToken)) return;
        send(deviceToken,
            "Points credited!",
            "+" + points + " pts — " + reason,
            Map.of("type", "POINTS_CREDITED", "points", String.valueOf(points)));
    }

    // ── Account reinstated ────────────────────────────────────────────────

    @Async
    public void notifyAccountReinstated(String deviceToken) {
        if (!isValid(deviceToken)) return;
        send(deviceToken,
            "Account reinstated",
            "Your GridClan Puzzles account is active again. Welcome back!",
            Map.of("type", "ACCOUNT_REINSTATED"));
    }

    // ── Internal send ─────────────────────────────────────────────────────

    private void send(String token, String title, String body, Map<String, String> data) {
        if (fcmServerKey == null || fcmServerKey.isBlank()) {
            log.debug("FCM_SERVER_KEY not set — push skipped: {}", title);
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "key=" + fcmServerKey);

            Map<String, Object> payload = Map.of(
                "to", token,
                "notification", Map.of("title", title, "body", body),
                "data", data,
                "priority", "high",
                "content_available", true
            );

            ResponseEntity<String> resp = restTemplate.exchange(
                FCM_URL, HttpMethod.POST,
                new HttpEntity<>(payload, headers), String.class);

            if (resp.getStatusCode().is2xxSuccessful()) {
                log.debug("Push sent: {}", title);
            } else {
                log.warn("Push failed ({}): {}", resp.getStatusCode(), title);
            }
        } catch (Exception e) {
            log.warn("Push notification failed for '{}': {}", title, e.getMessage());
        }
    }

    private boolean isValid(String token) {
        return token != null && !token.isBlank();
    }
}
