package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A real-money gem purchase via Relworx mobile money.
 *
 * Lifecycle: PENDING (created when the player taps a pack and we ask Relworx to
 * collect) → SUCCESSFUL (gems credited, exactly once) or FAILED.
 *
 * {@link #reference} is OUR idempotency key (unique): a Relworx webhook can only
 * credit gems once per reference, so retries / duplicate callbacks are safe.
 */
@Entity
@Table(name = "gem_purchases",
       uniqueConstraints = @UniqueConstraint(columnNames = "reference"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GemPurchase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "pack_id", nullable = false, length = 40)
    private String packId;

    @Column(nullable = false)
    private long gems;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** Mobile-money number charged — null for card purchases. */
    @Column(length = 24)
    private String msisdn;

    /** MOBILE_MONEY or CARD. */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String method = "MOBILE_MONEY";

    /** Our unique reference sent to Relworx and echoed back in the webhook. */
    @Column(nullable = false, length = 64)
    private String reference;

    /** Relworx's own reference for the collection (for support / reconciliation). */
    @Column(name = "provider_reference", length = 120)
    private String providerReference;

    /** PENDING / SUCCESSFUL / FAILED. */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}
