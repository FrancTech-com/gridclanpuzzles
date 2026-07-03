package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A player's real-cash prize balance in ONE currency (one row per user per
 * currency). Unlike gems — which stay closed-loop — this balance IS withdrawable
 * to mobile money via Relworx send-payment. Earnings credit it; withdrawals hold
 * (debit) it up-front and refund only on definitive payout failure.
 * balance must always be >= 0 (DB CHECK).
 */
@Entity
@Table(name = "player_wallets",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "currency"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlayerWallet {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Null after account erasure — the row is retained, identity decoupled. */
    @Column(name = "user_id")
    private UUID userId;

    /** Set on account erasure; anonymous link across the retained audit trail. */
    @Column(name = "tombstone_id")
    private UUID tombstoneId;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal balance = BigDecimal.ZERO;

    @Column(name = "lifetime_earned", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal lifetimeEarned = BigDecimal.ZERO;

    @Column(name = "lifetime_withdrawn", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal lifetimeWithdrawn = BigDecimal.ZERO;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}
