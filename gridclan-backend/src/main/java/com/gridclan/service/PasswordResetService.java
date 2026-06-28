package com.gridclan.service;

import com.gridclan.entity.User;
import com.gridclan.exception.UserNotFoundException;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Optional;

/**
 * OTP-based password reset.
 *
 * Flow:
 *   1. POST /auth/forgot-password {identifier}
 *      → generates 6-digit OTP
 *      → stores in Redis at key "pwreset:{identifier}" with 15min TTL
 *      → emails OTP to user
 *      → always returns 200 (no enumeration — same response whether email exists or not)
 *
 *   2. POST /auth/reset-password {identifier, otp, newPassword}
 *      → validates OTP from Redis
 *      → bcrypt-hashes new password and updates user row
 *      → deletes OTP key (single-use)
 *      → invalidates all sessions by nulling refreshTokenHash
 *
 * Rate: combined with /auth/ rate limit (5/300s) from RateLimitFilter.
 * OTP: 6 digits, cryptographically random (SecureRandom).
 * TTL: 15 minutes. OTP is deleted after first successful use.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private final UserRepository             userRepo;
    private final RedisTemplate<String, String> redis;
    private final NotificationService        notifications;
    private final AuditLogService            audit;
    private final BCryptPasswordEncoder      encoder;

    private static final String    KEY_PREFIX  = "pwreset:";
    private static final Duration  OTP_TTL     = Duration.ofMinutes(15);
    private static final int       OTP_DIGITS  = 6;
    private final SecureRandom     rng         = new SecureRandom();

    // ── Step 1: request OTP ───────────────────────────────────────────────

    public void requestReset(String identifier) {
        // Always succeed — caller never learns whether identifier exists
        Optional<User> user = userRepo.findByEmail(identifier)
            .or(() -> userRepo.findByPhoneNumber(identifier));

        if (user.isEmpty()) {
            log.debug("Password reset requested for unknown identifier: {}", maskId(identifier));
            return;  // Silent — no enumeration
        }

        User u   = user.get();
        String otp = generateOtp();
        String key = KEY_PREFIX + identifier.toLowerCase();

        redis.opsForValue().set(key, otp, OTP_TTL);

        // Email the OTP to the account's email (async; failures are logged, not
        // surfaced, to preserve the no-enumeration contract).
        notifications.sendPasswordResetOtp(u.getEmail(), otp, OTP_TTL.toMinutes());

        audit.record(u.getId(), "PASSWORD_RESET_REQUESTED", "identifier=" + maskId(identifier));
        log.info("Password reset OTP sent: userId={}", u.getId());
    }

    // ── Step 2: verify OTP + set new password ─────────────────────────────

    @Transactional
    public void resetPassword(String identifier, String otp, String newPassword) {
        String key      = KEY_PREFIX + identifier.toLowerCase();
        String stored   = redis.opsForValue().get(key);

        if (stored == null || !constantTimeEquals(stored, otp)) {
            throw new IllegalArgumentException("Invalid or expired OTP.");
        }

        User user = userRepo.findByEmail(identifier)
            .or(() -> userRepo.findByPhoneNumber(identifier))
            .orElseThrow(UserNotFoundException::new);

        // Consume OTP (single-use)
        redis.delete(key);

        // Update password + force logout of all sessions
        user.setPasswordHash(encoder.encode(newPassword));
        user.setRefreshTokenHash(null);                      // kill refresh tokens
        user.setTokenVersion(user.getTokenVersion() + 1);    // kill outstanding access tokens too
        user.setFailedLoginCount(0);
        user.setLockoutUntil(null);
        userRepo.save(user);

        audit.record(user.getId(), "PASSWORD_RESET_COMPLETE", null);
        log.info("Password reset complete: userId={}", user.getId());
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private String generateOtp() {
        int bound = (int) Math.pow(10, OTP_DIGITS);
        return String.format("%0" + OTP_DIGITS + "d", rng.nextInt(bound));
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

    private String maskId(String id) {
        if (id == null || id.length() < 4) return "****";
        return id.substring(0, 2) + "***" + id.substring(id.length() - 2);
    }
}
