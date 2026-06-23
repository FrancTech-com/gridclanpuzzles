package com.gridclan.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;
import java.util.UUID;

/** Spend gems to revive (continue) a failed solo/casual game session. */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ReviveRequest {
    @NotNull(message = "sessionId is required")
    private UUID sessionId;
}
