package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;
// Removed unused Hibernate imports

import java.time.Instant;
import java.util.UUID;

/**
 * GridClan User entity.
 * PII fields (username, email, phoneNumber, passwordHash, displayName,
 * avatarUrl, deviceToken, refreshTokenHash) are nulled during the
 * erasure pipeline to comply with GDPR / Uganda DPA 2019.
 */
@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // ── PII (erased on deletion) ───────────────────────────────────────────
    @Column(unique = true, length = 32)
    private String username;

    @Column(unique = true, length = 255)
    private String email;

    @Column(name = "email_verified")
    private boolean emailVerified;

    @Column(name = "phone_number", unique = true, length = 20)
    private String phoneNumber;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(name = "display_name", length = 64)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "device_token")
    private String deviceToken;

    // ── Account status ─────────────────────────────────────────────────────
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String role = "USER";

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean isActive = true;

    @Column(name = "is_suspended", nullable = false)
    @Builder.Default
    private boolean isSuspended = false;

    @Column(name = "suspension_reason")
    private String suspensionReason;

    @Column(name = "suspension_expires_at")
    private Instant suspensionExpiresAt;

    // ── Deletion workflow ──────────────────────────────────────────────────
    @Column(name = "deletion_requested_at")
    private Instant deletionRequestedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deletion_tombstone_id", unique = true)
    private UUID deletionTombstoneId;

    // ── Auth ───────────────────────────────────────────────────────────────
    @Column(name = "refresh_token_hash", length = 255)
    private String refreshTokenHash;

    /**
     * Session epoch. Embedded in every access token as the "tv" claim and checked
     * on each request — bumping it (logout, password reset) instantly invalidates
     * all outstanding access tokens, so a stolen/leaked token stops working.
     */
    @Column(name = "token_version", nullable = false)
    @Builder.Default
    private int tokenVersion = 0;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "last_active_at")
    private Instant lastActiveAt;

    @Column(name = "failed_login_count")
    @Builder.Default
    private int failedLoginCount = 0;

    @Column(name = "lockout_until")
    private Instant lockoutUntil;

    // ── Metadata ───────────────────────────────────────────────────────────
    @Column(name = "country_code", nullable = false, length = 2)
    @Builder.Default
    private String countryCode = "UG";

    /** Post-game popup ads are blocked until this instant (bought with gem
     *  packs). Null / past = popups show. The opt-in rewarded-ad button is
     *  never blocked — it's how players earn. */
    @Column(name = "ad_free_until")
    private Instant adFreeUntil;

    // ── Consent / age (data-protection only) ───────────────────────────────
    @Column(name = "marketing_consent", nullable = false)
    @Builder.Default
    private boolean marketingConsent = false;

    @Column(name = "marketing_consent_at")
    private Instant marketingConsentAt;

    @Column(name = "age_verified", nullable = false)
    @Builder.Default
    private boolean ageVerified = false;

    /** 18+ at registration (from the DOB check — the date itself is never
     *  stored). NULL = unknown (pre-V33 account) → treated as a minor for
     *  advertising: non-personalised, age-appropriate ads only. */
    @Column(name = "is_adult")
    private Boolean isAdult;

    /** Explicit opt-in for personalised ads. Honoured only for adults. */
    @Column(name = "ads_personalized", nullable = false)
    @Builder.Default
    private boolean adsPersonalized = false;

    // ── Privacy (V6) ───────────────────────────────────────────────────────
    @Column(name = "do_not_sell", nullable = false)
    @Builder.Default
    private boolean doNotSell = false;     // CCPA preference

    @Column(name = "do_not_sell_at")
    private Instant doNotSellAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = Instant.now(); }

    // ── Helpers ────────────────────────────────────────────────────────────
    public boolean isPendingDeletion() {
        return deletionRequestedAt != null && deletedAt == null;
    }
}
