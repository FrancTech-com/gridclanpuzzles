package com.gridclan;

import com.gridclan.config.AdsProperties;
import com.gridclan.entity.AdSession;
import com.gridclan.entity.User;
import com.gridclan.repository.AdSessionRepository;
import com.gridclan.repository.UserRepository;
import com.gridclan.service.AdRewardService;
import com.gridclan.service.WalletService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Ad rewards are the money faucet, so the invariants under test are:
 * a session credits EXACTLY once, the daily cap is enforced at both start and
 * credit time, expired sessions can't credit, and only the owner can complete.
 */
@ExtendWith(MockitoExtension.class)
class AdRewardTest {

    @Mock AdSessionRepository sessionRepo;
    @Mock UserRepository      userRepo;
    @Mock WalletService       walletService;

    private AdsProperties props(boolean testMode) {
        AdsProperties p = new AdsProperties();
        p.setTestMode(testMode);
        p.setDailyLimit(20);
        p.setRewardAmount(new BigDecimal("5.00"));
        p.setRewardCurrency("UGX");
        return p;
    }

    private AdsProperties withProvider() {
        AdsProperties p = props(false);
        AdsProperties.Provider prov = new AdsProperties.Provider();
        prov.setId("admob"); prov.setName("AdMob"); prov.setRole("PRIMARY");
        prov.setAppKey("key-1");
        p.setProviders(List.of(prov));
        return p;
    }

    private AdRewardService svc(AdsProperties p) {
        return new AdRewardService(p, sessionRepo, userRepo, walletService);
    }

    private AdSession issued(UUID user) {
        return AdSession.builder()
            .id(UUID.randomUUID()).userId(user).placement("REWARDED")
            .rewardAmount(new BigDecimal("5.00")).currency("UGX")
            // old enough to satisfy the min-watch floor (10s default)
            .status("ISSUED").createdAt(Instant.now().minus(Duration.ofSeconds(15)))
            .build();
    }

    // ── Configuration gating ────────────────────────────────────────────────────

    @Test
    void start_noProvidersNoTestMode_unavailable() {
        assertThatThrownBy(() -> svc(props(false)).start(UUID.randomUUID(), null, null))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("available");
        verifyNoInteractions(sessionRepo);
    }

    @Test
    void start_issuesSessionWithServerFixedReward() {
        Map<String, Object> out = svc(withProvider()).start(UUID.randomUUID(), "POST_GAME", null);
        assertThat(out.get("rewardAmount")).isEqualTo(new BigDecimal("5.00"));
        assertThat(out.get("rewardCurrency")).isEqualTo("UGX");
        verify(sessionRepo).save(argThat(s ->
            "POST_GAME".equals(s.getPlacement()) && "ISSUED".equals(s.getStatus())));
    }

    // ── Credit exactly once ─────────────────────────────────────────────────────

    @Test
    void complete_creditsWalletExactlyOnce() {
        UUID user = UUID.randomUUID();
        AdSession s = issued(user);
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));

        AdRewardService svc = svc(withProvider());
        Map<String, Object> out = svc.complete(user, s.getId(), "admob");
        assertThat(out.get("status")).isEqualTo("COMPLETED");
        verify(walletService, times(1)).credit(eq(user), eq("UGX"),
            eq(new BigDecimal("5.00")), eq("AD_REWARD"), eq(s.getId()), isNull());
        assertThat(s.getProvider()).isEqualTo("admob");

        // Duplicate submit (retry / double-tap) → same answer, no second credit.
        Map<String, Object> again = svc.complete(user, s.getId(), "admob");
        assertThat(again.get("status")).isEqualTo("COMPLETED");
        verify(walletService, times(1)).credit(any(), any(), any(), any(), any(), any());
    }

    @Test
    void complete_someoneElsesSession_notFound() {
        AdSession s = issued(UUID.randomUUID());
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));
        assertThatThrownBy(() -> svc(withProvider()).complete(UUID.randomUUID(), s.getId(), "admob"))
            .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(walletService);
    }

    @Test
    void complete_expiredSession_rejectedWithoutCredit() {
        UUID user = UUID.randomUUID();
        AdSession s = issued(user);
        s.setCreatedAt(Instant.now().minus(Duration.ofHours(2)));
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));

        assertThatThrownBy(() -> svc(withProvider()).complete(user, s.getId(), "admob"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("expired");
        verifyNoInteractions(walletService);
    }

    // ── Daily cap ───────────────────────────────────────────────────────────────

    @Test
    void start_atDailyCap_rejected() {
        UUID user = UUID.randomUUID();
        when(sessionRepo.countByUserIdAndStatusAndCompletedAtAfter(eq(user), eq("COMPLETED"), any()))
            .thenReturn(20L);
        assertThatThrownBy(() -> svc(withProvider()).start(user, null, null))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("limit");
        verify(sessionRepo, never()).save(any());
    }

    @Test
    void complete_capReachedAfterIssue_rejectedWithoutCredit() {
        UUID user = UUID.randomUUID();
        AdSession s = issued(user);
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));
        when(sessionRepo.countByUserIdAndStatusAndCompletedAtAfter(eq(user), eq("COMPLETED"), any()))
            .thenReturn(20L);

        assertThatThrownBy(() -> svc(withProvider()).complete(user, s.getId(), "admob"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("limit");
        verifyNoInteractions(walletService);
    }

    // ── Anti-fraud: minimum watch time ──────────────────────────────────────────

    @Test
    void complete_fasterThanMinWatch_rejectedButSessionStaysIssued() {
        UUID user = UUID.randomUUID();
        AdSession s = issued(user);
        s.setCreatedAt(Instant.now().minus(Duration.ofSeconds(2)));   // a 30s ad "done" in 2s
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));

        assertThatThrownBy(() -> svc(withProvider()).complete(user, s.getId(), "admob"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("too fast");
        verifyNoInteractions(walletService);
        // Still ISSUED: a genuine watch can complete it once enough time passes.
        assertThat(s.getStatus()).isEqualTo("ISSUED");
    }

    // ── Anti-fraud: per-device cap across accounts ──────────────────────────────

    @Test
    void start_deviceAtDailyCap_rejectedEvenOnFreshAccount() {
        UUID freshUser = UUID.randomUUID();   // 0 completes on the account…
        when(sessionRepo.countByDeviceIdAndStatusAndCompletedAtAfter(eq("device-1"), eq("COMPLETED"), any()))
            .thenReturn(20L);                 // …but the DEVICE is exhausted

        assertThatThrownBy(() -> svc(withProvider()).start(freshUser, null, "device-1"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("limit");
        verify(sessionRepo, never()).save(any());
    }

    @Test
    void complete_deviceCapReachedAfterIssue_rejectedWithoutCredit() {
        UUID user = UUID.randomUUID();
        AdSession s = issued(user);
        s.setDeviceId("device-1");
        when(sessionRepo.lockById(s.getId())).thenReturn(Optional.of(s));
        when(sessionRepo.countByDeviceIdAndStatusAndCompletedAtAfter(eq("device-1"), eq("COMPLETED"), any()))
            .thenReturn(20L);

        assertThatThrownBy(() -> svc(withProvider()).complete(user, s.getId(), "admob"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("limit");
        verifyNoInteractions(walletService);
    }

    // ── Personalised-ads consent (minors always non-personalised) ───────────────

    @Test
    void status_personalizedOnlyForConsentingAdult() {
        UUID adultId = UUID.randomUUID();
        User adult = User.builder().id(adultId).isAdult(true).adsPersonalized(true).build();
        when(userRepo.findById(adultId)).thenReturn(Optional.of(adult));
        assertThat(svc(withProvider()).status(adultId).get("personalizedAllowed")).isEqualTo(true);

        UUID minorId = UUID.randomUUID();
        User minor = User.builder().id(minorId).isAdult(false).adsPersonalized(true).build();
        when(userRepo.findById(minorId)).thenReturn(Optional.of(minor));
        assertThat(svc(withProvider()).status(minorId).get("personalizedAllowed")).isEqualTo(false);

        // Unknown age (pre-V33 account) = treated as minor.
        UUID unknownId = UUID.randomUUID();
        User unknown = User.builder().id(unknownId).adsPersonalized(true).build();
        when(userRepo.findById(unknownId)).thenReturn(Optional.of(unknown));
        assertThat(svc(withProvider()).status(unknownId).get("personalizedAllowed")).isEqualTo(false);
    }

    @Test
    void confirmAge_setsAdultOnceAndNeverOverwrites() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();   // pre-V33: age unknown
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));
        AdRewardService svc = svc(withProvider());

        // First confirmation (adult DOB) sets the flag.
        Map<String, Object> out = svc.confirmAge(userId, java.time.LocalDate.now().minusYears(25));
        assertThat(user.getIsAdult()).isTrue();
        assertThat(out.get("ageKnown")).isEqualTo(true);

        // A later "confirmation" claiming a different age is ignored — the
        // flag is one-time, whether it was set here or at registration.
        svc.confirmAge(userId, java.time.LocalDate.now().minusYears(14));
        assertThat(user.getIsAdult()).isTrue();
    }

    @Test
    void confirmAge_minorDob_setsMinor() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));

        svc(withProvider()).confirmAge(userId, java.time.LocalDate.now().minusYears(15));
        assertThat(user.getIsAdult()).isFalse();
    }

    @Test
    void confirmAge_futureDate_rejected() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> svc(withProvider())
                .confirmAge(userId, java.time.LocalDate.now().plusDays(1)))
            .isInstanceOf(ResponseStatusException.class);
        assertThat(user.getIsAdult()).isNull();
    }

    @Test
    void setPersonalizedConsent_storesToggle() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).isAdult(true).build();
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));

        Map<String, Object> out = svc(withProvider()).setPersonalizedConsent(userId, true);
        assertThat(user.isAdsPersonalized()).isTrue();
        assertThat(out.get("personalizedAllowed")).isEqualTo(true);
        verify(userRepo).save(user);
    }

    // ── Ad-free window ──────────────────────────────────────────────────────────

    @Test
    void extendAdFree_stacksOnRemainingTime() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        Instant existing = Instant.now().plus(Duration.ofDays(10));
        user.setAdFreeUntil(existing);
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));

        svc(withProvider()).extendAdFree(userId, 4);   // popular pack = 4 months

        assertThat(user.getAdFreeUntil()).isEqualTo(existing.plus(Duration.ofDays(120)));
        verify(userRepo).save(user);
    }

    @Test
    void extendAdFree_expiredWindow_startsFromNow() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        user.setAdFreeUntil(Instant.now().minus(Duration.ofDays(5)));
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));

        svc(withProvider()).extendAdFree(userId, 1);   // starter pack = 1 month

        assertThat(user.getAdFreeUntil()).isAfter(Instant.now().plus(Duration.ofDays(29)));
        assertThat(user.getAdFreeUntil()).isBefore(Instant.now().plus(Duration.ofDays(31)));
    }

    // ── Status ──────────────────────────────────────────────────────────────────

    @Test
    void status_reportsAdFreeAndRemaining() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        user.setAdFreeUntil(Instant.now().plus(Duration.ofDays(30)));
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));
        when(sessionRepo.countByUserIdAndStatusAndCompletedAtAfter(eq(userId), eq("COMPLETED"), any()))
            .thenReturn(3L);

        Map<String, Object> out = svc(withProvider()).status(userId);

        assertThat(out.get("configured")).isEqualTo(true);
        assertThat(out.get("adFree")).isEqualTo(true);
        assertThat(out.get("remainingToday")).isEqualTo(17);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> providers = (List<Map<String, Object>>) out.get("providers");
        assertThat(providers).hasSize(1);
        assertThat(providers.get(0).get("id")).isEqualTo("admob");
    }
}
