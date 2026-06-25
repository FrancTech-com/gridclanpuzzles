package com.gridclan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * OneSignal push notifications (works for web PWA + mobile).
 *
 * Players are targeted by their GridClan userId as the OneSignal
 * "external user id" (set client-side via OneSignal.login(userId)). Sends are
 * @Async and best-effort — a no-op until ONESIGNAL_APP_ID + ONESIGNAL_API_KEY
 * are configured, and never fatal to game logic.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OneSignalService {

    private static final String API_URL = "https://onesignal.com/api/v1/notifications";

    private final RestTemplate restTemplate;

    @Value("${gridclan.onesignal.app-id:}")  private String appId;
    @Value("${gridclan.onesignal.api-key:}") private String apiKey;

    public boolean enabled() {
        return appId != null && !appId.isBlank() && apiKey != null && !apiKey.isBlank();
    }

    /** Send a push to one user (by external user id) on the push channel. */
    @Async
    public void notifyUser(UUID userId, String title, String body, Map<String, String> data) {
        if (!enabled() || userId == null) return;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Basic " + apiKey);

            Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("app_id", appId);
            payload.put("include_external_user_ids", List.of(userId.toString()));
            payload.put("channel_for_external_user_ids", "push");
            payload.put("headings", Map.of("en", title));
            payload.put("contents", Map.of("en", body));
            payload.put("data", data);
            if (data != null && data.get("url") != null) payload.put("url", data.get("url")); // click-through

            ResponseEntity<String> resp = restTemplate.exchange(
                API_URL, HttpMethod.POST, new HttpEntity<>(payload, headers), String.class);
            if (!resp.getStatusCode().is2xxSuccessful())
                log.warn("OneSignal push non-2xx ({}): {}", resp.getStatusCode(), title);
        } catch (Exception e) {
            log.warn("OneSignal push failed for '{}': {}", title, e.getMessage());
        }
    }
}
