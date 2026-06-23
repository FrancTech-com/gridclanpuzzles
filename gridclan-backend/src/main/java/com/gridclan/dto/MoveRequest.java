package com.gridclan.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MoveRequest {
    @NotNull private UUID sessionId;
    @NotNull(message = "move payload is required") private Object move;
    private long clientTimestamp;
}
