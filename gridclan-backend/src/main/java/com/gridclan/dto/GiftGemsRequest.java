package com.gridclan.dto;

import jakarta.validation.constraints.*;
import lombok.*;
import java.util.UUID;

/** Gift gems to a friend. A gift is NOT a sale — no money is involved. */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GiftGemsRequest {

    @NotNull(message = "recipientId is required")
    private UUID recipientId;

    @Min(value = 1, message = "amount must be at least 1")
    @Max(value = 500, message = "amount exceeds the per-gift maximum")
    private long amount;

    @Size(max = 200, message = "note must be 200 characters or fewer")
    private String note;
}
