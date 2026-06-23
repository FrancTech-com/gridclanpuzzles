package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tournaments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Tournament {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "community_id")
    private UUID communityId;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "game_type", nullable = false, length = 50)
    private String gameType;

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String tier = "COMMUNITY_TOURNAMENT";

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "UPCOMING";

    @Column(name = "entry_fee_pts")
    @Builder.Default
    private int entryFeePts = 0;

    @Column(name = "prize_pool_pts")
    @Builder.Default
    private long prizePoolPts = 0L;

    /** Always FALSE for COMMUNITY_TOURNAMENT — enforced in app layer AND DB */
    @Column(name = "hints_allowed", nullable = false)
    @Builder.Default
    private boolean hintsAllowed = false;

    @Column(name = "max_players")
    private Integer maxPlayers;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
