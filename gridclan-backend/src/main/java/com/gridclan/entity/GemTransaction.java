package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only gem ledger. Every gem credit/debit is recorded for audit.
 *
 * type:
 *   GAME_REWARD | DAILY_BONUS | TOURNAMENT_PRIZE | AD_REWARD
 *   | GIFT_SENT | GIFT_RECEIVED | REVIVE | REPLAY | COSMETIC | HINT | SKIP
 *
 * Gems never convert to money, crypto, or any external/tradable value.
 *
 * Invariant enforced by DB CHECK:
 *   balance_after == balance_before + gems_delta
 */
@Entity
@Table(name = "gem_transactions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GemTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 30)
    private String type;

    /** Positive = credit, Negative = debit */
    @Column(name = "gems_delta", nullable = false)
    private long gemsDelta;

    @Column(name = "balance_before", nullable = false)
    private long balanceBefore;

    @Column(name = "balance_after", nullable = false)
    private long balanceAfter;

    /** Other user for gifts (sender/recipient). */
    @Column(name = "counterparty_id")
    private UUID counterpartyId;

    /** Session / tournament / ad-session id. */
    @Column(name = "reference_id")
    private UUID referenceId;

    @Column
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
