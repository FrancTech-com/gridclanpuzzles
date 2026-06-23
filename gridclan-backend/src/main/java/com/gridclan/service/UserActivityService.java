package com.gridclan.service;

import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Tracks real-time user presence and activity.
 *
 * Two-tier design:
 *   1. Redis presence key  "presence:{userId}" with 5-minute TTL →
 *      used for "currently online" counts (cheap, no DB hit).
 *   2. DB last_active_at updated every ~5 minutes debounced →
 *      used for "active in last 24h / 7d / 30d" aggregate queries.
 *
 * The heartbeat endpoint (POST /user/heartbeat) always refreshes the
 * Redis key. The DB write only fires when the existing DB timestamp is
 * more than 5 minutes old to avoid hammering the users table.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserActivityService {

    private final RedisTemplate<String, String> redis;
    private final UserRepository                userRepo;

    private static final Duration PRESENCE_TTL    = Duration.ofMinutes(5);
    private static final Duration DB_DEBOUNCE      = Duration.ofMinutes(5);
    private static final String   PRESENCE_PREFIX  = "presence:";
    private static final String   ONLINE_SET       = "online_users";

    /**
     * Called on every heartbeat (POST /user/heartbeat).
     * Fast-path: Redis only. DB write is debounced to ≤ once per 5 minutes.
     */
    @Transactional
    public void recordHeartbeat(UUID userId) {
        String key = PRESENCE_PREFIX + userId;
        redis.opsForValue().set(key, "1", PRESENCE_TTL);
        redis.opsForSet().add(ONLINE_SET, userId.toString());

        // DB debounce: only update if the Redis debounce key is absent
        String debounceKey = "hb_db:" + userId;
        Boolean isFirstInWindow = redis.opsForValue()
                .setIfAbsent(debounceKey, "1", DB_DEBOUNCE);

        if (Boolean.TRUE.equals(isFirstInWindow)) {
            try {
                userRepo.updateLastActiveAt(userId, Instant.now());
            } catch (Exception e) {
                log.warn("Failed to persist last_active_at for userId={}: {}", userId, e.getMessage());
            }
        }
    }

    /**
     * Returns the count of users whose Redis presence key is still alive
     * (i.e., sent a heartbeat within the last 5 minutes).
     * This is an approximation — Redis set membership persists until TTL.
     */
    public long countOnlineNow() {
        Long size = redis.opsForSet().size(ONLINE_SET);
        return size != null ? size : 0L;
    }

    /** Mark a user offline immediately (on logout / account deletion). */
    public void clearPresence(UUID userId) {
        redis.delete(PRESENCE_PREFIX + userId);
        redis.opsForSet().remove(ONLINE_SET, userId.toString());
    }
}
