package com.gridclan;

import com.gridclan.anticheat.AntiCheatEngine;
import com.gridclan.entity.enums.GameType;
import com.gridclan.exception.CheatDetectedException;
import com.gridclan.repository.FlaggedEventRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AntiCheatEngineTest {

    @Mock FlaggedEventRepository flagRepo;
    @InjectMocks AntiCheatEngine engine;

    // ── Speed gate ───────────────────────────────────────────────────────

    @Test @DisplayName("GRID_LOCKDOWN: 50ms move → SPEED_VIOLATION")
    void gridLockdown_speedViolation() {
        when(flagRepo.save(any())).thenReturn(null);
        assertThatThrownBy(() -> engine.validateMoveSpeed(GameType.GRID_LOCKDOWN, 50L))
            .isInstanceOf(CheatDetectedException.class)
            .hasMessageContaining("SPEED_VIOLATION");
    }

    @Test @DisplayName("SUM_CIPHER: 399ms move → SPEED_VIOLATION (min 400ms)")
    void sumCipher_speedViolation() {
        when(flagRepo.save(any())).thenReturn(null);
        assertThatThrownBy(() -> engine.validateMoveSpeed(GameType.SUM_CIPHER, 399L))
            .isInstanceOf(CheatDetectedException.class);
    }

    @Test @DisplayName("LINKED_RUSH: 200ms move → valid (exactly on threshold)")
    void linkedRush_exactThreshold_valid() {
        assertThatCode(() -> engine.validateMoveSpeed(GameType.LINKED_RUSH, 200L))
            .doesNotThrowAnyException();
    }

    @Test @DisplayName("GRID_LOCKDOWN: 300ms move → valid")
    void gridLockdown_validSpeed() {
        assertThatCode(() -> engine.validateMoveSpeed(GameType.GRID_LOCKDOWN, 300L))
            .doesNotThrowAnyException();
    }

    // ── Logic gate — GridLockdown ─────────────────────────────────────────

    @Test @DisplayName("GridLockdown: diagonal move → IMPOSSIBLE_MOVE")
    void gridLockdown_diagonalMove_rejected() {
        when(flagRepo.save(any())).thenReturn(null);

        var board = Map.of(
            "grid", List.of(
                List.of(1, 0, 0),
                List.of(0, 0, 0),
                List.of(0, 0, 0)
            ),
            "targetPattern", List.of(List.of(0,0,0), List.of(0,1,0), List.of(0,0,0))
        );
        var move = Map.of("fromX", 0, "fromY", 0, "toX", 1, "toY", 1);  // diagonal

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.GRID_LOCKDOWN, board, move, null, null))
            .isInstanceOf(CheatDetectedException.class)
            .hasMessageContaining("IMPOSSIBLE_MOVE");
    }

    @Test @DisplayName("GridLockdown: valid orthogonal move → passes")
    void gridLockdown_orthogonalMove_valid() {
        var board = Map.of(
            "grid", List.of(
                List.of(1, 0, 0),
                List.of(0, 0, 0),
                List.of(0, 0, 0)
            ),
            "targetPattern", List.of(List.of(0,1,0), List.of(0,0,0), List.of(0,0,0))
        );
        var move = Map.of("fromX", 0, "fromY", 0, "toX", 1, "toY", 0);  // right

        assertThatCode(() -> engine.validateMoveLogic(
            GameType.GRID_LOCKDOWN, board, move, null, null))
            .doesNotThrowAnyException();
    }

    // ── Logic gate — SumCipher ────────────────────────────────────────────

    @Test @DisplayName("SumCipher: digit that exceeds group target → IMPOSSIBLE_MOVE")
    void sumCipher_digitExceedsTarget_rejected() {
        when(flagRepo.save(any())).thenReturn(null);

        var board = Map.of(
            "cells",      List.of(0, 5, 4),
            "groups",     List.of(List.of(0, 1, 2)),
            "targetSums", List.of(10)
        );
        // Placing 9 → sum=18, exceeds target 10
        var move = Map.of("cellIndex", 0, "digit", 9);

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.SUM_CIPHER, board, move, null, null))
            .isInstanceOf(CheatDetectedException.class);
    }

    @Test @DisplayName("SumCipher: valid digit placement → passes")
    void sumCipher_validDigit_passes() {
        var board = Map.of(
            "cells",      List.of(0, 3, 2),
            "groups",     List.of(List.of(0, 1, 2)),
            "targetSums", List.of(10)
        );
        var move = Map.of("cellIndex", 0, "digit", 5);  // 5+3+2=10 ✓

        assertThatCode(() -> engine.validateMoveLogic(
            GameType.SUM_CIPHER, board, move, null, null))
            .doesNotThrowAnyException();
    }

    // ── Logic gate — LinkedRush ───────────────────────────────────────────

    @Test @DisplayName("LinkedRush: move to non-adjacent node → IMPOSSIBLE_MOVE")
    void linkedRush_nonAdjacentNode_rejected() {
        when(flagRepo.save(any())).thenReturn(null);

        var board = Map.of(
            "adjacency",    Map.of("0", List.of(1, 2), "1", List.of(0)),
            "visitedNodes", List.of(0)
        );
        var move = Map.of("fromNode", 0, "toNode", 7);  // 7 not adjacent to 0

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.LINKED_RUSH, board, move, null, null))
            .isInstanceOf(CheatDetectedException.class);
    }

    @Test @DisplayName("LinkedRush: move to already-visited node → IMPOSSIBLE_MOVE")
    void linkedRush_visitedNode_rejected() {
        when(flagRepo.save(any())).thenReturn(null);

        var board = Map.of(
            "adjacency",    Map.of("0", List.of(1, 2)),
            "visitedNodes", List.of(0, 1)   // node 1 already visited
        );
        var move = Map.of("fromNode", 0, "toNode", 1);

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.LINKED_RUSH, board, move, null, null))
            .isInstanceOf(CheatDetectedException.class);
    }
}
