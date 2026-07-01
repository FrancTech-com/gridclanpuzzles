package com.gridclan.dto;

import com.gridclan.entity.enums.SessionStatus;
import lombok.*;
import java.util.Map;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MoveResponse {
    private Map<String, Object> boardState;
    private int score;
    private int moveCount;
    private int moveLimit;
    private SessionStatus status;
    private String flagReason;
}
