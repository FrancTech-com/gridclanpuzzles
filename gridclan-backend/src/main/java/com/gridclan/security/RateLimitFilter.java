package com.gridclan.security;

import com.gridclan.service.UserSuspensionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

/**
 * Two-layer rate limiting:
 *   Layer 1 (this filter): per-user + per-IP Redis sliding window counters.
 *   Layer 2 (NGINX): global IP token bucket at the edge.
 *
 * Limits (from blueprint):
 *   /game/session/move   → 30 / 10s  (per user), 60 / 10s  (per IP)
 *   /community/chat       →  5 /  3s
 *   /user/points/balance  → 10 / 60s
 *   /game/session/start   →  3 / 60s
 *   /auth/login           →  5 / 300s
 *   /user/gems/gift       →  3 / 60s
 *   /user/gems/balance    → 10 / 60s
 *   /user/gems/ad-reward  →  5 / 300s
 *   /game/session/revive  →  5 / 60s
 *   /game/session/replay  →  3 / 60s
 *
 * Escalation: 5 violations within 24h → 1-hour account quarantine.
 */
@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    private final RedisTemplate<String, String> redis;
    private final UserSuspensionService         suspension;

    /** {maxRequests, windowSeconds} */
    private static final Map<String, int[]> LIMITS = Map.ofEntries(
        Map.entry("/game/session/move",    new int[]{30,  10}),
        Map.entry("/community/chat",       new int[]{5,    3}),
        Map.entry("/user/points/balance",  new int[]{10,  60}),
        Map.entry("/game/session/start",   new int[]{3,   60}),
        Map.entry("/auth/login",           new int[]{5,  300}),
        Map.entry("/user/gems/gift",       new int[]{3,   60}),
        Map.entry("/user/gems/balance",    new int[]{10,  60}),
        Map.entry("/user/gems/ad-reward",  new int[]{5,  300}),
        Map.entry("/game/session/revive",  new int[]{5,   60}),
        Map.entry("/game/session/replay",  new int[]{3,   60}),
        // Ad money faucet: a real ad takes ~30s, so >6 completes/3min = abuse.
        Map.entry("/ads/start",            new int[]{10, 180}),
        Map.entry("/ads/complete",         new int[]{6,  180})
    );

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain)
            throws IOException, ServletException {

        String path   = req.getRequestURI();
        String userId = extractUserIdFromJwt(req);
        String ip     = getClientIp(req);

        int[] limit = LIMITS.entrySet().stream()
            .filter(e -> path.startsWith(e.getKey()))
            .map(Map.Entry::getValue)
            .findFirst()
            .orElse(null);

        if (limit != null) {
            int maxReq = limit[0], windowSec = limit[1];

            // IP gets 2× allowance — tolerates NAT / shared campus Wi-Fi
            boolean userBlocked = userId != null
                && isLimited("rl:user:" + userId + ":" + path, maxReq, windowSec);
            boolean ipBlocked   = isLimited("rl:ip:" + ip + ":" + path,
                                             maxReq * 2, windowSec);

            if (userBlocked || ipBlocked) {
                if (userId != null) {
                    int violations = incrementViolations(userId);
                    if (violations >= 5) {
                        suspension.quarantine(userId, Duration.ofHours(1),
                            "Repeated rate limit violations: " + path);
                        log.warn("User {} quarantined for rate limit abuse on {}", userId, path);
                    }
                }

                res.setStatus(429);
                res.setHeader("Retry-After", String.valueOf(windowSec));
                res.setContentType("application/json");
                res.getWriter().write(
                    "{\"error\":\"Rate limit exceeded\",\"retryAfterSeconds\":" + windowSec + "}");
                return;
            }
        }

        chain.doFilter(req, res);
    }

    /**
     * Redis sliding window: atomic INCR, set expiry only on first hit.
     * Returns true if count exceeds max.
     */
    private boolean isLimited(String key, int max, int windowSec) {
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, Duration.ofSeconds(windowSec));
        }
        return count != null && count > max;
    }

    /** Violation counter expires after 24h; escalation resets with it. */
    private int incrementViolations(String userId) {
        String key = "violations:" + userId;
        Long n = redis.opsForValue().increment(key);
        if (n != null && n == 1) {
            redis.expire(key, Duration.ofHours(24));
        }
        return n != null ? n.intValue() : 0;
    }

    private String getClientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        return (fwd != null && !fwd.isEmpty()) ? fwd.split(",")[0].trim() : req.getRemoteAddr();
    }

    /** Best-effort extraction — JWT not yet validated at this stage. */
    private String extractUserIdFromJwt(HttpServletRequest req) {
        try {
            String header = req.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) return null;
            String token = header.substring(7);
            // Decode payload only (no sig verify — this is just for the key)
            String[] parts = token.split("\\.");
            if (parts.length < 2) return null;
            String payload = new String(java.util.Base64.getUrlDecoder().decode(parts[1]));
            // Extract sub field
            int start = payload.indexOf("\"sub\":\"") + 7;
            int end   = payload.indexOf("\"", start);
            if (start > 6 && end > start) return payload.substring(start, end);
        } catch (Exception ignored) {}
        return null;
    }
}
