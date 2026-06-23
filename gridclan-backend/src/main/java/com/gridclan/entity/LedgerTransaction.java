package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only POINTS audit ledger. Never deleted.
 *
 * Points are a pure score / progression metric — they have no monetary
 * value and no conversion path. This ledger records point movements
 * (game wins, community distribution) for audit and the player history view.
 *
 * After user erasure:
 *   user_id      → NULL       (identity removed)
 *   tombstone_id → UUID       (non-reversible identifier)
 *
 * No FK on user_id by design — decouples identity from the audit trail.
 *
 * Invariant enforced by DB CHECK:
 *   balance_after == balance_before + points_delta
 */
@Entity
@Table(name = "ledger_transactions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LedgerTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // NO @ManyToOne — intentional. FK removed to allow identity decoupling.
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "tombstone_id")
    private UUID tombstoneId;

    /**
     * Transaction type:
     *   GAME_WIN | COMMUNITY_DISTRIBUTION
     * (no money/crypto/withdrawal types exist — points never leave the game)
     */
    @Column(nullable = false, length = 50)
    private String type;

    /** Positive = credit, Negative = debit */
    @Column(name = "points_delta", nullable = false)
    private long pointsDelta;

    @Column(name = "balance_before", nullable = false)
    private long balanceBefore;

    @Column(name = "balance_after", nullable = false)
    private long balanceAfter;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "reference_type", length = 50)
    private String referenceType;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "COMPLETED";

    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
