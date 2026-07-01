package com.gridclan.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InitiateCardRequest {
    @NotBlank(message = "packId is required")
    private String packId;

    /** Currency to charge the card in (one of the supported currencies). */
    @NotBlank(message = "currency is required")
    private String currency;
}
