package com.gridclan.controller;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.gridclan.service.AdRewardService;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Ad-reward endpoints — watching ads is what earns players their withdrawable
 * money. Sessions are issued server-side before an ad plays and credited at
 * most once on completion (see AdRewardService for the trust model).
 */
@RestController
@RequestMapping("/ads")
@RequiredArgsConstructor
public class AdsController {

    private final AdRewardService service;

    /** GET /ads/status — configured?, provider chain, reward, remaining today,
     *  and whether this player's popup ads are blocked (ad-free). */
    @GetMapping("/status")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> status(Authentication auth) {
        return ResponseEntity.ok(service.status((UUID) auth.getPrincipal()));
    }

    /** POST /ads/start — issue an ad session before the ad plays. */
    @PostMapping("/start")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> start(
            @RequestBody(required = false) StartAdRequest req, Authentication auth) {
        String placement = req != null ? req.getPlacement() : null;
        String deviceId  = req != null ? req.getDeviceId()  : null;
        return ResponseEntity.ok(service.start((UUID) auth.getPrincipal(), placement, deviceId));
    }

    /** POST /ads/confirm-age — one-time age confirmation for accounts created
     *  before registration recorded the 18+ flag. The date is checked and
     *  discarded (data minimisation), exactly like registration. */
    @PostMapping("/confirm-age")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> confirmAge(
            @RequestBody ConfirmAgeRequest req, Authentication auth) {
        return ResponseEntity.ok(service.confirmAge(
            (UUID) auth.getPrincipal(), req.getDateOfBirth()));
    }

    /** POST /ads/consent — opt in/out of personalised ads (non-personalised is
     *  the default; consent is only honoured for known adults). */
    @PostMapping("/consent")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> consent(
            @RequestBody ConsentRequest req, Authentication auth) {
        return ResponseEntity.ok(service.setPersonalizedConsent(
            (UUID) auth.getPrincipal(), Boolean.TRUE.equals(req.getPersonalized())));
    }

    /** POST /ads/complete — the ad finished; credit the wallet (once). */
    @PostMapping("/complete")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> complete(
            @RequestBody CompleteAdRequest req, Authentication auth) {
        return ResponseEntity.ok(service.complete(
            (UUID) auth.getPrincipal(), req.getAdSessionId(), req.getProviderId()));
    }

    @Getter @Setter
    public static class StartAdRequest {
        /** REWARDED (opt-in button, default) or POST_GAME (popup after a game). */
        private String placement;
        /** Client install id — ties the daily cap to the device too. */
        private String deviceId;
    }

    @Getter @Setter
    public static class ConsentRequest {
        private Boolean personalized;
    }

    @Getter @Setter
    public static class ConfirmAgeRequest {
        /** Checked, then discarded — never stored (same as registration). */
        @NotNull
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate dateOfBirth;
    }

    @Getter @Setter
    public static class CompleteAdRequest {
        @NotNull
        private UUID adSessionId;
        /** Which network actually served it (for reconciliation with reports). */
        private String providerId;
    }
}
