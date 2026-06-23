package com.gridclan.dto;

import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ErrorResponse {
    private int status;
    private String error;
    private String message;
    private long timestamp;

    public static ErrorResponse of(int status, String error, String message) {
        return ErrorResponse.builder().status(status).error(error)
            .message(message).timestamp(System.currentTimeMillis()).build();
    }
}
