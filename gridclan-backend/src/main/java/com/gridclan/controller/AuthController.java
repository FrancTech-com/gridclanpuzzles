package com.gridclan.controller;

import com.gridclan.dto.*;
import com.gridclan.entity.User;
import com.gridclan.entity.PlayerPoints;
import com.gridclan.repository.PlayerPointsRepository;
import com.gridclan.repository.UserRepository;
import com.gridclan.security.JwtService;
import com.gridclan.service.AuditLogService;
import com.gridclan.service.FeatureFlagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Map;
import java.util.UUID;

/**
 * Authentication endpoints.
 *
 * Rate limits (enforced by RateLimitFilter):
 *   /auth/login    → 5 / 300s
 *   /auth/register → shares /auth/ prefix limit (5 / 300s)
 *
 * Brute-force lockout: 5 failed logins → 15-minute account lockout.
 * Lockout resets on successful login.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final UserRepository         userRepo;
    private final PlayerPointsRepository pointsRepo;
    private final JwtService             jwtService;
    private final AuditLogService        audit;
    private final FeatureFlagService     featureFlags;
    private final com.gridclan.service.WalletService     walletService;
    private final com.gridclan.config.WalletProperties   walletProps;

    private final BCryptPasswordEncoder encoder;  // Injected from PasswordEncoderConfig

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_SECONDS     = 900;  // 15 minutes
    private static final int MIN_AGE_YEARS       = 13;   // COPPA

    // ── Register ──────────────────────────────────────────────────────────

    @PostMapping("/register")
    @Transactional
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
        if (userRepo.existsByEmail(req.getEmail()))
            return conflict("Email already registered.");
        if (req.getUsername() != null && userRepo.existsByUsername(req.getUsername()))
            return conflict("Username already taken.");
        if (req.getPhoneNumber() != null && userRepo.existsByPhoneNumber(req.getPhoneNumber()))
            return conflict("Phone number already registered.");

        String country = req.getCountryCode() != null ? req.getCountryCode() : "UG";

        // ── COPPA age gate ────────────────────────────────────────────────
        int age = Period.between(req.getDateOfBirth(), LocalDate.now()).getYears();
        if (age < MIN_AGE_YEARS) {
            audit.record(null, "REGISTRATION_BLOCKED_AGE", "age=" + age + " country=" + country);
            log.warn("Registration blocked (under {}): age={} country={}", MIN_AGE_YEARS, age, country);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "AGE_RESTRICTED",
                "message", "You must be at least " + MIN_AGE_YEARS + " years old to register."));
        }

        // ── Country policy feature flag (e.g. BLOCK_CHINA_SIGNUP) ──────────
        if (!featureFlags.isSignupAllowed(country)) {
            audit.record(null, "REGISTRATION_BLOCKED_FEATURE_FLAG", "country=" + country);
            log.warn("Registration blocked (feature flag): country={}", country);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "REGION_NOT_SUPPORTED",
                "message", "Registration is not available in your region."));
        }

        boolean marketingConsent = Boolean.TRUE.equals(req.getMarketingConsent());
        Instant now = Instant.now();

        User user = User.builder()
            .username(req.getUsername())
            .email(req.getEmail())
            .phoneNumber(req.getPhoneNumber())
            .passwordHash(encoder.encode(req.getPassword()))
            .displayName(req.getUsername() != null ? req.getUsername() : req.getEmail())
            .countryCode(country)
            .role("USER")
            .ageVerified(true)
            .isAdult(age >= 18)   // ads: minors get non-personalised only
            .marketingConsent(marketingConsent)
            .marketingConsentAt(marketingConsent ? now : null)
            .termsAcceptedAt(Boolean.TRUE.equals(req.getTermsAccepted()) ? now : null)
            .build();
        userRepo.save(user);

        // Seed player_points row
        pointsRepo.save(PlayerPoints.builder().userId(user.getId()).balance(0L).build());

        // Welcome credit: every player joins with a starting wallet balance
        // (config: UGX 500). One-time, ledgered as WELCOME_BONUS.
        walletService.credit(user.getId(), walletProps.getWelcomeCurrency(),
            walletProps.getWelcomeBonus(), "WELCOME_BONUS", null, "Welcome credit");

        TokenPair tokens = issueTokens(user);
        audit.record(user.getId(), "USER_REGISTERED",
            "email=" + req.getEmail() + " country=" + user.getCountryCode());

        log.info("New user registered: id={} country={}", user.getId(), user.getCountryCode());
        return ResponseEntity.status(HttpStatus.CREATED).body(
            AuthResponse.builder()
                .accessToken(tokens.access())
                .refreshToken(tokens.refresh())
                .role(user.getRole())
                .userId(user.getId())
                .build());
    }

    // ── Login ─────────────────────────────────────────────────────────────

    @PostMapping("/login")
    @Transactional
    public ResponseEntity<?> login(@Valid @RequestBody AuthRequest req,
                                   @RequestHeader(value = "X-Forwarded-For",
                                                  required = false) String ip) {
        User user = userRepo.findByEmail(req.getIdentifier())
            .or(() -> userRepo.findByPhoneNumber(req.getIdentifier()))
            .orElse(null);

        // Use same error for "not found" vs "wrong password" — prevents username enumeration
        if (user == null) return badCredentials();

        // Brute-force lockout
        if (user.getLockoutUntil() != null && user.getLockoutUntil().isAfter(Instant.now())) {
            long secondsLeft = user.getLockoutUntil().getEpochSecond() - Instant.now().getEpochSecond();
            return ResponseEntity.status(429).body(Map.of(
                "error", "Account temporarily locked. Try again in " + secondsLeft + "s."
            ));
        }

        if (!encoder.matches(req.getPassword(), user.getPasswordHash())) {
            int attempts = user.getFailedLoginCount() + 1;
            user.setFailedLoginCount(attempts);
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                user.setLockoutUntil(Instant.now().plusSeconds(LOCKOUT_SECONDS));
                user.setFailedLoginCount(0);
                audit.record(user.getId(), "ACCOUNT_LOCKED", "ip=" + ip);
                log.warn("Account locked after {} failed attempts: userId={}", attempts, user.getId());
            }
            userRepo.save(user);
            return badCredentials();
        }

        // Success — reset lockout state
        user.setFailedLoginCount(0);
        user.setLockoutUntil(null);
        user.setLastLoginAt(Instant.now());

        TokenPair tokens = issueTokens(user);
        audit.record(user.getId(), "USER_LOGIN", "ip=" + ip);
        return ResponseEntity.ok(AuthResponse.builder()
            .accessToken(tokens.access())
            .refreshToken(tokens.refresh())
            .role(user.getRole())
            .userId(user.getId())
            .build());
    }

    // ── Refresh ───────────────────────────────────────────────────────────

    @PostMapping("/refresh")
    @Transactional
    public ResponseEntity<?> refresh(@Valid @RequestBody RefreshRequest req) {
        try {
            var claims = jwtService.validateAndParse(req.getRefreshToken());
            if (!"REFRESH".equals(claims.get("type"))) return unauthorized();

            UUID userId = UUID.fromString(claims.getSubject());
            User user   = userRepo.findById(userId).orElse(null);
            if (user == null || !user.isActive()) return unauthorized();

            // ── Reuse detection ───────────────────────────────────────────
            // The signature verified, so WE issued this token. If it doesn't
            // match the current stored hash it was already rotated (or the
            // user logged out) — someone is replaying a stale token. Assume
            // theft: kill the active session so neither party keeps access.
            if (user.getRefreshTokenHash() == null
                    || !encoder.matches(req.getRefreshToken(), user.getRefreshTokenHash())) {
                user.setRefreshTokenHash(null);
                userRepo.save(user);
                audit.record(userId, "REFRESH_TOKEN_REUSE_DETECTED",
                    "Rotated refresh token replayed — all sessions invalidated");
                log.warn("Refresh token reuse detected: userId={} — sessions invalidated", userId);
                return unauthorized();
            }

            TokenPair tokens = issueTokens(user);
            return ResponseEntity.ok(AuthResponse.builder()
                .accessToken(tokens.access())
                .refreshToken(tokens.refresh())
                .role(user.getRole())
                .userId(userId)
                .build());

        } catch (Exception e) {
            return unauthorized();
        }
    }

    // ── Logout ────────────────────────────────────────────────────────────

    @PostMapping("/logout")
    @Transactional
    public ResponseEntity<Void> logout(Authentication auth) {
        if (auth != null) {
            UUID userId = (UUID) auth.getPrincipal();
            userRepo.findById(userId).ifPresent(user -> {
                user.setRefreshTokenHash(null);
                // Bump the session epoch so the access token already in flight (and any
                // copy a thief may hold) is rejected immediately, not just after expiry.
                user.setTokenVersion(user.getTokenVersion() + 1);
                userRepo.save(user);
                audit.record(userId, "USER_LOGOUT", null);
            });
        }
        return ResponseEntity.noContent().build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private TokenPair issueTokens(User user) {
        String access  = jwtService.generateAccessToken(user.getId(), user.getRole(), user.getTokenVersion());
        String refresh = jwtService.generateRefreshToken(user.getId());
        user.setRefreshTokenHash(encoder.encode(refresh));
        userRepo.save(user);
        return new TokenPair(access, refresh);
    }

    private ResponseEntity<Map<String, String>> badCredentials() {
        return ResponseEntity.status(401)
            .body(Map.of("error", "Invalid credentials."));
    }

    private ResponseEntity<Void> unauthorized() {
        return ResponseEntity.status(401).build();
    }

    private ResponseEntity<Map<String, String>> conflict(String msg) {
        return ResponseEntity.status(409).body(Map.of("error", msg));
    }

    private record TokenPair(String access, String refresh) {}
}
