package com.gridclan.dto;

import jakarta.validation.constraints.*;
import lombok.*;

/** Gift gems to a friend. A gift is NOT a sale — no money is involved. */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GiftGemsRequest {

    /**
     * The recipient, identified by username (what players actually know) or,
     * for back-compat, a raw user-id UUID. Resolved server-side.
     */
    @NotBlank(message = "recipient is required")
    private String recipient;

    @Min(value = 1, message = "amount must be at least 1")
    @Max(value = 500, message = "amount exceeds the per-gift maximum")
    private long amount;

    @Size(max = 200, message = "note must be 200 characters or fewer")
    private String note;
}
