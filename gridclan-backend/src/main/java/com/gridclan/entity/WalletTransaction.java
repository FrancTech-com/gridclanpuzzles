package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Immutable audit row for every wallet movement. Types:
 * PRIZE (earnings in), WITHDRAW_HOLD (debit on initiate),
 * WITHDRAW_REFUND (credit back on definitive payout failure).
 */
@Entity
@Table(name = "wallet_transactions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class WalletTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false, length = 32)
    private String type;

    @Column(name = "amount_delta", nullable = false, precision = 18, scale = 2)
    private BigDecimal amountDelta;

    @Column(name = "balance_before", nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceBefore;

    @Column(name = "balance_after", nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    /** The withdrawal / prize source this movement belongs to, if any. */
    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(length = 255)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
