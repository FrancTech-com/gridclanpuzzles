package com.gridclan.dto;

import com.gridclan.entity.ActiveSession;
import com.gridclan.entity.enums.GameTier;
import com.gridclan.entity.enums.GameType;
import lombok.*;
import java.util.Map;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SessionStartResponse {
    private UUID sessionId;
    private Map<String, Object> initialBoard;
    private boolean hintsAllowed;
    private GameType gameType;
    private GameTier tier;
    private String status;

    public static SessionStartResponse from(ActiveSession s) {
        return SessionStartResponse.builder()
            .sessionId(s.getId()).initialBoard(s.getBoardState())
            .hintsAllowed(s.isHintsAllowed()).gameType(s.getGameType())
            .tier(s.getTier()).status(s.getStatus().name()).build();
    }
}
