package com.gridclan.service;

import com.gridclan.config.AdsProperties;
import com.gridclan.entity.AdSession;
import com.gridclan.entity.User;
import com.gridclan.repository.AdSessionRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ad rewards — THE earning system that funds player payouts. Every completed
 * ad credits money (config: UGX 5.00 ≙ 10 points) straight to the player's
 * wallet; gem purchases never fund payouts, they only buy ad-FREE months.
 *
 * Trust model (server-authoritative, mirrors the rest of the money code):
 *   • A session is ISSUED by the server before the ad plays; the reward amount
 *     is frozen into the row from config — the client can never name a price.
 *   • Completion credits EXACTLY once per session (row-locked, idempotent),
 *     only for the session's owner, only while the session is fresh.
 *   • A rolling 24h daily cap bounds how much the faucet can pay any player.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdRewardService {

    private final AdsProperties       ads;
    private final AdSessionRepository sessionRepo;
    private final UserRepository      userRepo;
    private final WalletService       walletService;

    // ── Status (drives all client ad decisions) ──────────────────────────────

    /**
     * Everything the client needs to decide about ads: whether the system is
     * live, the provider failover chain to try, how many rewarded ads the
     * player has left today, and whether their popup ads are blocked (ad-free).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> status(UUID userId) {
        User user = userRepo.findById(userId).orElse(null);
        Instant adFreeUntil = user != null ? user.getAdFreeUntil() : null;
        boolean adFree = adFreeUntil != null && adFreeUntil.isAfter(Instant.now());

        List<Map<String, Object>> providers = new ArrayList<>();
        for (AdsProperties.Provider p : ads.activeProviders()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",     p.getId());
            m.put("name",   p.getName());
            m.put("role",   p.getRole());
            m.put("appKey", p.getAppKey());   // SDK init key (public-side id)
            providers.add(m);
        }

        // Personalised ads only for a KNOWN adult who explicitly consented;
        // unknown age (pre-V33 account) is treated as a minor. Non-personalised
        // is always the safe default the ad SDKs are told to use.
        boolean adult   = user != null && Boolean.TRUE.equals(user.getIsAdult());
        boolean consent = user != null && user.isAdsPersonalized();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured",     ads.isConfigured());
        out.put("testMode",       ads.isTestMode());
        out.put("providers",      providers);
        out.put("rewardAmount",   ads.getRewardAmount());
        out.put("rewardCurrency", ads.getRewardCurrency());
        out.put("dailyLimit",     ads.getDailyLimit());
        out.put("remainingToday", remainingToday(userId));
        out.put("adFree",         adFree);          // popup (post-game) ads blocked
        out.put("adFreeUntil",    adFreeUntil);
        out.put("personalizedConsent", consent);            // raw toggle state
        out.put("personalizedAllowed", adult && consent);   // what SDKs may do
        // False only for pre-V33 accounts (registration now records 18+):
        // tells the client to run the one-time "confirm your age" step.
        out.put("ageKnown", user != null && user.getIsAdult() != null);
        return out;
    }

    /**
     * One-time age confirmation for accounts created before the 18+ flag
     * existed. Mirrors registration: the date of birth is checked and
     * DISCARDED — only the boolean conclusion is stored. Once the flag is
     * set (here or at registration) it can never be changed by the client,
     * so a minor can't later re-declare as an adult to unlock personalised
     * ads. Idempotent: confirming an already-known account changes nothing.
     */
    @Transactional
    public Map<String, Object> confirmAge(UUID userId, LocalDate dateOfBirth) {
        User user = userRepo.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));
        if (user.getIsAdult() == null) {
            if (dateOfBirth == null || !dateOfBirth.isBefore(LocalDate.now())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Please enter a valid date of birth.");
            }
            boolean adult = Period.between(dateOfBirth, LocalDate.now()).getYears() >= 18;
            user.setIsAdult(adult);
            userRepo.save(user);
            log.info("Age confirmed (backfill): user={} adult={}", userId, adult);
        }
        boolean adult = Boolean.TRUE.equals(user.getIsAdult());
        return Map.of(
            "ageKnown", true,
            "personalizedConsent", user.isAdsPersonalized(),
            "personalizedAllowed", adult && user.isAdsPersonalized());
    }

    /** Set the personalised-ads consent toggle (stored even for minors, but
     *  only honoured — see status() — once the account is a known adult). */
    @Transactional
    public Map<String, Object> setPersonalizedConsent(UUID userId, boolean personalized) {
        User user = userRepo.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));
        user.setAdsPersonalized(personalized);
        userRepo.save(user);
        boolean adult = Boolean.TRUE.equals(user.getIsAdult());
        return Map.of(
            "personalizedConsent", personalized,
            "personalizedAllowed", adult && personalized);
    }

    // ── Start (issue a session before the ad plays) ──────────────────────────

    /** Issue an ad session. The reward is frozen server-side into the row;
     *  the id comes back to us on completion. */
    @Transactional
    public Map<String, Object> start(UUID userId, String placement, String deviceId) {
        if (!ads.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Ads aren't available right now.");
        }
        String device = normalizeDeviceId(deviceId);
        if (remainingToday(userId) <= 0 || deviceExhausted(device)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "You've reached today's ad limit — come back tomorrow!");
        }
        String pl = "POST_GAME".equalsIgnoreCase(placement) ? "POST_GAME" : "REWARDED";
        AdSession s = AdSession.builder()
            .userId(userId).placement(pl).deviceId(device)
            .rewardAmount(ads.getRewardAmount()).currency(ads.getRewardCurrency())
            .build();
        sessionRepo.save(s);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("adSessionId",    s.getId());
        out.put("rewardAmount",   s.getRewardAmount());
        out.put("rewardCurrency", s.getCurrency());
        return out;
    }

    // ── Complete (credit exactly once) ───────────────────────────────────────

    /**
     * The ad finished — credit the wallet. Idempotent: a session credits once,
     * ever; retries and double-taps return the same result without paying twice.
     */
    @Transactional
    public Map<String, Object> complete(UUID userId, UUID adSessionId, String providerId) {
        AdSession s = sessionRepo.lockById(adSessionId)
            .filter(x -> x.getUserId().equals(userId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Ad session not found."));

        if (!"COMPLETED".equals(s.getStatus())) {
            if (s.getCreatedAt().isBefore(
                    Instant.now().minus(Duration.ofMinutes(ads.getSessionExpiryMinutes())))) {
                throw new ResponseStatusException(HttpStatus.GONE,
                    "That ad session expired — start a new ad.");
            }
            // Minimum watch time: a real rewarded ad runs 15–30s. A completion
            // arriving faster than the floor is a script, not a viewer — the
            // session stays ISSUED, so a genuine watch can still finish it.
            if (s.getCreatedAt().isAfter(
                    Instant.now().minus(Duration.ofSeconds(ads.getMinWatchSeconds())))) {
                log.warn("Ad completion too fast (possible bot): user={} session={} ageMs={}",
                    userId, s.getId(), Duration.between(s.getCreatedAt(), Instant.now()).toMillis());
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That was too fast — watch the ad to the end to earn the reward.");
            }
            // Re-check the caps at credit time so parallel sessions can't exceed
            // them — per user AND per device (multi-account farming).
            if (remainingToday(userId) <= 0 || deviceExhausted(s.getDeviceId())) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "You've reached today's ad limit — come back tomorrow!");
            }
            s.setStatus("COMPLETED");
            s.setCompletedAt(Instant.now());
            s.setProvider(providerId != null && providerId.length() > 32
                ? providerId.substring(0, 32) : providerId);
            sessionRepo.save(s);
            walletService.credit(userId, s.getCurrency(), s.getRewardAmount(),
                "AD_REWARD", s.getId(), null);
            log.info("Ad reward credited: user={} {} {} session={} provider={}",
                userId, s.getRewardAmount(), s.getCurrency(), s.getId(), providerId);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status",         s.getStatus());
        out.put("rewardAmount",   s.getRewardAmount());
        out.put("rewardCurrency", s.getCurrency());
        out.put("remainingToday", remainingToday(userId));
        return out;
    }

    // ── Ad-free (bought with gem packs) ──────────────────────────────────────

    /**
     * Extend the player's popup-ad-free window by {@code months} (stacking on
     * whatever time is already left). Called by the gem-purchase webhook when a
     * pack with ad-free months is paid for.
     */
    @Transactional
    public void extendAdFree(UUID userId, int months) {
        if (months <= 0) return;
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return;
        Instant base = user.getAdFreeUntil() != null && user.getAdFreeUntil().isAfter(Instant.now())
            ? user.getAdFreeUntil() : Instant.now();
        user.setAdFreeUntil(base.plus(Duration.ofDays(30L * months)));
        userRepo.save(user);
        log.info("Ad-free extended: user={} months={} until={}", userId, months, user.getAdFreeUntil());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private int remainingToday(UUID userId) {
        long used = sessionRepo.countByUserIdAndStatusAndCompletedAtAfter(
            userId, "COMPLETED", Instant.now().minus(Duration.ofHours(24)));
        return (int) Math.max(0, ads.getDailyLimit() - used);
    }

    /** Has this DEVICE (across all accounts) already hit the daily cap? */
    private boolean deviceExhausted(String deviceId) {
        if (deviceId == null) return false;   // old client — user cap still applies
        long used = sessionRepo.countByDeviceIdAndStatusAndCompletedAtAfter(
            deviceId, "COMPLETED", Instant.now().minus(Duration.ofHours(24)));
        return used >= ads.getDailyLimit();
    }

    private String normalizeDeviceId(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) return null;
        String d = deviceId.trim();
        return d.length() > 64 ? d.substring(0, 64) : d;
    }
}
