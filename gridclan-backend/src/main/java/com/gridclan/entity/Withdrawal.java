package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A real-cash payout to a player's mobile-money number via Relworx send-payment.
 *
 * Lifecycle: PENDING (funds held from the wallet, send-payment requested) →
 * SUCCESSFUL (money delivered — hold becomes final) or FAILED (hold refunded,
 * exactly once).
 *
 * {@link #reference} is OUR idempotency key (unique): the send-payment webhook
 * can settle a withdrawal at most once, so duplicate callbacks can neither
 * double-refund nor flip a settled payout.
 */
@Entity
@Table(name = "withdrawals",
       uniqueConstraints = @UniqueConstraint(columnNames = "reference"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Withdrawal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Null after account erasure — the row is retained, identity decoupled. */
    @Column(name = "user_id")
    private UUID userId;

    /** Set on account erasure; anonymous link across the retained audit trail.
     *  msisdn is kept even then — the payout destination is part of the
     *  financial record required by Uganda AML record-keeping. */
    @Column(name = "tombstone_id")
    private UUID tombstoneId;

    /** Mobile-money number the payout is sent to. */
    @Column(nullable = false, length = 24)
    private String msisdn;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** Our unique reference sent to Relworx and echoed back in the webhook. */
    @Column(nullable = false, length = 64)
    private String reference;

    /** Relworx's own reference for the payout (for support / reconciliation). */
    @Column(name = "provider_reference", length = 120)
    private String providerReference;

    /** PENDING / SUCCESSFUL / FAILED. */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    /** Provider's reason on failure (e.g. invalid number); null otherwise. */
    @Column(name = "failure_reason", length = 255)
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}
