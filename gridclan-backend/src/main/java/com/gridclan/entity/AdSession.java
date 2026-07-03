package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One ad view. Issued server-side BEFORE the ad plays (so the reward amount is
 * fixed by the server, never the client) and COMPLETED at most once — this row
 * is the idempotency unit for ad money: a session can only ever credit the
 * wallet a single time.
 *
 * Lifecycle: ISSUED (player asked to watch, ad starting) → COMPLETED (ad
 * finished, wallet credited). Sessions that never complete simply expire.
 */
@Entity
@Table(name = "ad_sessions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AdSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Which ad network actually served the ad (set on completion). */
    @Column(length = 32)
    private String provider;

    /** REWARDED (opt-in button) or POST_GAME (popup after a game). */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String placement = "REWARDED";

    /** Client install id — lets the daily cap also bind the DEVICE, so ten
     *  accounts on one phone can't multiply the faucet. Null on old clients. */
    @Column(name = "device_id", length = 64)
    private String deviceId;

    /** ISSUED / COMPLETED. */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "ISSUED";

    /** Money credited on completion — fixed at issue time from server config. */
    @Column(name = "reward_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal rewardAmount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;
}
