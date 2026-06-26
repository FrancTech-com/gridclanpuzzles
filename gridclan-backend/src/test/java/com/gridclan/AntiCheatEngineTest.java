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

    // A tiny board with HUG hidden across the top row (left→right).
    private Map<String, Object> board() {
        return Map.of(
            "type",  "WORD_SEARCH",
            "rows",  3, "cols", 3,
            "grid",  List.of("HUG", "XYZ", "QQQ"),
            "words", List.of("HUG"),
            "found", List.of()
        );
    }

    // ── Speed gate ───────────────────────────────────────────────────────

    @Test @DisplayName("WORD_SEARCH: 50ms move → SPEED_VIOLATION")
    void wordSearch_speedViolation() {
        when(flagRepo.save(any())).thenReturn(null);
        assertThatThrownBy(() -> engine.validateMoveSpeed(GameType.WORD_SEARCH, 50L))
            .isInstanceOf(CheatDetectedException.class)
            .hasMessageContaining("SPEED_VIOLATION");
    }

    @Test @DisplayName("WORD_SEARCH: 250ms move → valid (exactly on threshold)")
    void wordSearch_exactThreshold_valid() {
        assertThatCode(() -> engine.validateMoveSpeed(GameType.WORD_SEARCH, 250L))
            .doesNotThrowAnyException();
    }

    // ── Logic gate — structural legality only ─────────────────────────────

    @Test @DisplayName("WORD_SEARCH: out-of-bounds selection → IMPOSSIBLE_MOVE")
    void wordSearch_outOfBounds_rejected() {
        when(flagRepo.save(any())).thenReturn(null);
        var move = Map.of("fromRow", 0, "fromCol", 0, "toRow", 0, "toCol", 9);  // col 9 off-grid

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.WORD_SEARCH, board(), move, null, null))
            .isInstanceOf(CheatDetectedException.class)
            .hasMessageContaining("IMPOSSIBLE_MOVE");
    }

    @Test @DisplayName("WORD_SEARCH: non-straight (knight) selection → IMPOSSIBLE_MOVE")
    void wordSearch_nonStraightLine_rejected() {
        when(flagRepo.save(any())).thenReturn(null);
        var move = Map.of("fromRow", 0, "fromCol", 0, "toRow", 2, "toCol", 1);  // not H/V/diagonal

        assertThatThrownBy(() -> engine.validateMoveLogic(
            GameType.WORD_SEARCH, board(), move, null, null))
            .isInstanceOf(CheatDetectedException.class);
    }

    @Test @DisplayName("WORD_SEARCH: a straight line selection → passes (word check happens later)")
    void wordSearch_straightLine_passes() {
        var move = Map.of("fromRow", 0, "fromCol", 0, "toRow", 0, "toCol", 2);  // top row

        assertThatCode(() -> engine.validateMoveLogic(
            GameType.WORD_SEARCH, board(), move, null, null))
            .doesNotThrowAnyException();
    }

    @Test @DisplayName("WORD_SEARCH: a wrong straight-line guess is NOT a cheat")
    void wordSearch_wrongGuess_notCheating() {
        var move = Map.of("fromRow", 1, "fromCol", 0, "toRow", 1, "toCol", 2);  // "XYZ" — not a word

        assertThatCode(() -> engine.validateMoveLogic(
            GameType.WORD_SEARCH, board(), move, null, null))
            .doesNotThrowAnyException();
    }
}
