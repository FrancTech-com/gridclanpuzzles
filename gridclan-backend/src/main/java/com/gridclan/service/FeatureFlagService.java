package com.gridclan.service;

import com.gridclan.entity.FeatureFlag;
import com.gridclan.repository.FeatureFlagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;

/**
 * Per-country feature flags (blueprint § FEATURE FLAGS).
 *
 * Resolution order for {@link #isEnabled}:
 *   1. Redis cache   (key: feature:{flag}:{country}, 5-min TTL)
 *   2. Postgres      (feature_flags table — source of truth)
 *   3. Global row    (country_code 'XX')
 *   4. Hard-coded defaults below
 *
 * Redis is treated as a best-effort cache: any Redis failure degrades to the
 * database/defaults rather than failing the request (keeps registration
 * available if the cache is briefly unreachable).
 *
 * Checked at: registration (country geo-policy only).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FeatureFlagService {

    private final FeatureFlagRepository flagRepo;
    private final RedisTemplate<String, String> redis;
    private final AuditLogService audit;

    private static final String GLOBAL = "XX";
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    /** Fallback defaults if a flag has never been persisted. */
    private static final Map<String, Boolean> DEFAULTS = Map.of(
        "BLOCK_CHINA_SIGNUP",   true,
        "EU_RESTRICTED",        false,
        "ZA_RESTRICTED",        true,
        "IRAN_BLOCKED",         true,
        "NORTH_KOREA_BLOCKED",  true,
        "SYRIA_BLOCKED",        true,
        "CUBA_BLOCKED",         true
    );

    /** Country -> signup-blocking flag. Checked at registration. */
    private static final Map<String, String> SIGNUP_BLOCK_FLAGS = Map.of(
        "CN", "BLOCK_CHINA_SIGNUP"
    );

    /**
     * EU/EEA members resolve EU_RESTRICTED against the pseudo-country row 'EU'
     * (one switch covers the whole bloc — MiCA applies EU-wide).
     */
    private static final Set<String> EU_EEA_COUNTRIES = Set.of(
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
        "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
        "PL", "PT", "RO", "SK", "SI", "ES", "SE",
        "IS", "LI", "NO"
    );

    // ── Reads ──────────────────────────────────────────────────────────────

    public boolean isEnabled(String flagName, String countryCode) {
        String country = normalise(countryCode);

        Boolean cached = readCache(flagName, country);
        if (cached != null) return cached;

        // DB: country-specific row, then global row.
        Boolean resolved = flagRepo.findByFlagNameAndCountryCode(flagName, country)
            .map(FeatureFlag::isEnabled)
            .orElseGet(() -> flagRepo.findByFlagNameAndCountryCode(flagName, GLOBAL)
                .map(FeatureFlag::isEnabled)
                .orElse(DEFAULTS.getOrDefault(flagName, false)));

        writeCache(flagName, country, resolved);
        return resolved;
    }

    /**
     * True when a brand-new account from {@code countryCode} is permitted.
     * Backs the registration country-policy gate (e.g. BLOCK_CHINA_SIGNUP).
     * This is an optional data-residency / signup geo-policy switch only —
     * GridClan Puzzles has no financial features, so no cashout/AML gating exists.
     */
    public boolean isSignupAllowed(String countryCode) {
        String country = normalise(countryCode);
        if (EU_EEA_COUNTRIES.contains(country) && isEnabled("EU_RESTRICTED", "EU")) {
            return false;
        }
        String flag = SIGNUP_BLOCK_FLAGS.get(country);
        return flag == null || !isEnabled(flag, country);
    }

    // ── Admin write ────────────────────────────────────────────────────────

    @Transactional
    public FeatureFlag setFlag(String flagName, String countryCode, boolean enabled, Object actorId) {
        String country = normalise(countryCode);
        FeatureFlag flag = flagRepo.findByFlagNameAndCountryCode(flagName, country)
            .orElseGet(() -> FeatureFlag.builder()
                .flagName(flagName).countryCode(country).build());
        flag.setEnabled(enabled);
        flag.setUpdatedAt(Instant.now());
        flagRepo.save(flag);

        // Refresh cache immediately so the change takes effect without TTL wait.
        writeCache(flagName, country, enabled);

        audit.record(null, "FEATURE_FLAG_UPDATED",
            "by=" + actorId + " flag=" + flagName + " country=" + country + " enabled=" + enabled);
        return flag;
    }

    // ── Redis cache helpers (best-effort) ──────────────────────────────────

    private String key(String flagName, String country) {
        return "feature:" + flagName + ":" + country;
    }

    private Boolean readCache(String flagName, String country) {
        try {
            String v = redis.opsForValue().get(key(flagName, country));
            return v == null ? null : Boolean.valueOf(v);
        } catch (Exception e) {
            log.debug("Feature-flag cache read failed ({}): {}", flagName, e.getMessage());
            return null;
        }
    }

    private void writeCache(String flagName, String country, boolean value) {
        try {
            redis.opsForValue().set(key(flagName, country), Boolean.toString(value), CACHE_TTL);
        } catch (Exception e) {
            log.debug("Feature-flag cache write failed ({}): {}", flagName, e.getMessage());
        }
    }

    private String normalise(String countryCode) {
        return countryCode == null || countryCode.isBlank()
            ? GLOBAL : countryCode.trim().toUpperCase();
    }
}
