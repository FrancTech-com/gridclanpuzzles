package com.gridclan.dto;

import lombok.*;
import java.util.Map;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class HintResponse {
    private Map<String, Object> boardState;
    private int score;
    private Object hintData;
}
