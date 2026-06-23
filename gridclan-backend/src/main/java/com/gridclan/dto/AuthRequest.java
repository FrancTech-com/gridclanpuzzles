package com.gridclan.dto;

import jakarta.validation.constraints.*;
import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AuthRequest {
    @NotBlank private String identifier;
    @NotBlank @Size(min = 8) private String password;
}
