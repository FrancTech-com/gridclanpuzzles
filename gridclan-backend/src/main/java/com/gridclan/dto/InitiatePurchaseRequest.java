package com.gridclan.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InitiatePurchaseRequest {
    @NotBlank(message = "packId is required")
    private String packId;

    /** Mobile-money number to charge; its country sets the currency. */
    @NotBlank(message = "msisdn is required")
    private String msisdn;
}
