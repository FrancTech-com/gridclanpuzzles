package com.gridclan.dto;

import com.gridclan.entity.enums.GameType;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import java.util.UUID;

/** Spend gems to replay a game with the same friend. */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ReplayRequest {
    @NotNull(message = "friendId is required")
    private UUID friendId;

    @NotNull(message = "gameType is required")
    private GameType gameType;
}
