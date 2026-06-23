package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Per-country feature flag. Source of truth in Postgres; FeatureFlagService
 * caches each row in Redis for 5 minutes (key: feature:{flag_name}:{country}).
 *
 * country_code 'XX' denotes a global / non-country-specific flag.
 */
@Entity
@Table(name = "feature_flags",
       uniqueConstraints = @UniqueConstraint(columnNames = {"flag_name", "country_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FeatureFlag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "flag_name", nullable = false, length = 100)
    private String flagName;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = false;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
