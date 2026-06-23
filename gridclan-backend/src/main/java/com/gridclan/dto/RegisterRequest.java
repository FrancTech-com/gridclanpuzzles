package com.gridclan.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.*;
import lombok.*;

import java.time.LocalDate;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RegisterRequest {
    @NotBlank @Size(min=3,max=32) @Pattern(regexp="^[a-zA-Z0-9_]+$") private String username;
    @NotBlank @Email private String email;
    @Pattern(regexp="^\\+?[0-9]{9,15}$") private String phoneNumber;
    @NotBlank @Size(min=8,max=72) private String password;
    @Pattern(regexp="^[A-Z]{2}$") private String countryCode;

    /**
     * COPPA age gate. Required and must be in the past; the controller blocks
     * registration if the implied age is under 13. The date itself is NOT
     * persisted (GDPR/Uganda DPA data minimisation) — only the resulting
     * age_verified flag is stored.
     */
    @NotNull @Past
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dateOfBirth;

    /** GDPR Art. 6(1)(a) explicit opt-in for marketing email. Defaults to no consent. */
    @Builder.Default
    private Boolean marketingConsent = false;
}
