package com.gridclan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * Cache-aside for points balances (blueprint § Scalability: "Redis caches
 * leaderboard, balance, profile for 60s"). Best-effort: any Redis failure
 * falls through to Postgres — the cache can never make a read fail.
 *
 * EVERY balance mutation must call {@link #evict}; the 60s TTL only bounds
 * staleness if an eviction site is missed.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BalanceCache {

    private final RedisTemplate<String, String> redis;

    private static final Duration TTL = Duration.ofSeconds(60);

    public Optional<Long> get(UUID userId) {
        try {
            String v = redis.opsForValue().get(key(userId));
            return v == null ? Optional.empty() : Optional.of(Long.parseLong(v));
        } catch (Exception e) {
            log.debug("Balance cache read failed: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public void put(UUID userId, long balance) {
        try {
            redis.opsForValue().set(key(userId), Long.toString(balance), TTL);
        } catch (Exception e) {
            log.debug("Balance cache write failed: {}", e.getMessage());
        }
    }

    public void evict(UUID userId) {
        try {
            redis.delete(key(userId));
        } catch (Exception e) {
            // TTL bounds staleness to 60s if the eviction is lost
            log.warn("Balance cache eviction failed for {}: {}", userId, e.getMessage());
        }
    }

    private String key(UUID userId) {
        return "balance:" + userId;
    }
}
