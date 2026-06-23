package com.gridclan.dto;

import jakarta.validation.constraints.*;
import lombok.*;
import java.util.UUID;

/**
 * Claim gems from an optional rewarded ad. The gem amount is fixed
 * server-side — the client only supplies adSessionId for idempotency.
 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AdRewardRequest {
    @NotNull(message = "adSessionId is required for idempotency")
    private UUID adSessionId;
}
