package com.gridclan.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/** Body of POST /payments/withdraw/initiate. */
@Getter @Setter
public class InitiateWithdrawalRequest {

    /** Mobile-money number the payout goes to (E.164-ish; server normalises). */
    @NotBlank
    private String msisdn;

    @NotNull
    @DecimalMin(value = "0.01")
    private BigDecimal amount;
}
