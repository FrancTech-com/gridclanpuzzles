package com.gridclan.dto;

import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameTier;
import com.gridclan.entity.enums.GameType;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SessionStartRequest {
    @NotNull(message = "gameType is required") private GameType gameType;
    @NotNull(message = "tier is required")     private GameTier tier;
    private UUID tournamentId;

    /**
     * Optional difficulty-ladder selection for SOLO play. When present, the server
     * generates a board sized for {@code difficulty}+{@code level}, scales the
     * score accordingly, and enforces the locked ladder. Absent for a quick
     * (non-ladder) solo game, friend challenges, and tournaments.
     */
    private Difficulty difficulty;
    private Integer    level;
}
