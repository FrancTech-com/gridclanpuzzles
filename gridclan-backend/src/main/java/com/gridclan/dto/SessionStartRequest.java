package com.gridclan.dto;

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
}
