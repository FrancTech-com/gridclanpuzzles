package com.gridclan.controller;

import com.gridclan.service.PasswordResetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Password reset endpoints.
 *
 * POST /auth/forgot-password  {identifier}           → sends OTP email
 * POST /auth/reset-password   {identifier, otp, newPassword} → applies reset
 *
 * Both share the /auth/ rate limit (5/300s).
 * Response for /forgot-password is always 200 — no user enumeration.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService resetService;

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest req) {
        resetService.requestReset(req.getIdentifier());
        // Always 200 — same response whether identifier exists or not
        return ResponseEntity.ok(Map.of(
            "message", "If that account exists, a reset code has been sent."
        ));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest req) {
        try {
            resetService.resetPassword(req.getIdentifier(), req.getOtp(), req.getNewPassword());
            return ResponseEntity.ok(Map.of(
                "message", "Password updated. All sessions have been signed out."
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Inner DTOs ────────────────────────────────────────────────────────

    @Getter @Setter @NoArgsConstructor
    static class ForgotPasswordRequest {
        @NotBlank
        private String identifier;  // email or phone
    }

    @Getter @Setter @NoArgsConstructor
    static class ResetPasswordRequest {

        @NotBlank
        private String identifier;

        @NotBlank
        @Pattern(regexp = "^\\d{6}$", message = "OTP must be exactly 6 digits")
        private String otp;

        @NotBlank
        @Size(min = 8, max = 72, message = "Password must be 8–72 characters")
        private String newPassword;
    }
}
