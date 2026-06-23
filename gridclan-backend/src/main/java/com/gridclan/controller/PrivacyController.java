package com.gridclan.controller;

import com.gridclan.entity.User;
import com.gridclan.repository.UserRepository;
import com.gridclan.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Privacy / consent endpoints.
 *
 * POST /user/consent/withdraw — GDPR Art. 7(3): withdrawing marketing consent
 * must be as easy as giving it, and takes effect immediately. Clearing
 * marketing_consent here stops the account from being included in any
 * marketing email send.
 *
 * POST /user/privacy/do-not-sell — CCPA (blueprint § GLOBAL PRIVACY LAWS).
 * GridClan never sells personal data; recording the request makes the
 * preference explicit, auditable, and durable across policy changes.
 */
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class PrivacyController {

    private final UserRepository  userRepo;
    private final AuditLogService audit;

    @PostMapping("/consent/withdraw")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, Object>> withdrawMarketingConsent(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        boolean wasConsented = user.isMarketingConsent();
        user.setMarketingConsent(false);
        user.setMarketingConsentAt(null);
        userRepo.save(user);

        audit.record(userId, "MARKETING_CONSENT_WITHDRAWN", "previouslyConsented=" + wasConsented);

        return ResponseEntity.ok(Map.of(
            "status",           "CONSENT_WITHDRAWN",
            "marketingConsent", false,
            "message",          "You will no longer receive marketing emails."
        ));
    }

    @PostMapping("/privacy/do-not-sell")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public ResponseEntity<Map<String, Object>> doNotSell(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        if (!user.isDoNotSell()) {
            user.setDoNotSell(true);
            user.setDoNotSellAt(Instant.now());
            userRepo.save(user);
            audit.record(userId, "DO_NOT_SELL_REQUESTED", null);
        }

        return ResponseEntity.ok(Map.of(
            "status",    "DO_NOT_SELL_RECORDED",
            "doNotSell", true,
            "message",   "Your preference has been recorded. GridClan does not sell personal information."
        ));
    }
}
