package com.gridclan;

import com.gridclan.entity.PlayerLevelProgress;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameType;
import com.gridclan.repository.PlayerLevelProgressRepository;
import com.gridclan.service.LevelService;
import com.gridclan.service.ScoreEngine;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for the difficulty ladder: parameter ramps, score scaling, and the
 * locked-ladder unlock/guard rules. No Spring / DB — pure logic + a mocked repo.
 */
@ExtendWith(MockitoExtension.class)
class DifficultyLadderTest {

    @Mock PlayerLevelProgressRepository repo;

    private final ScoreEngine scoreEngine = new ScoreEngine();

    // ── Difficulty parameter ramps ────────────────────────────────────────────

    @Test
    void difficulty_paramsRampWithinBounds() {
        for (Difficulty d : Difficulty.values()) {
            // Level 1 sits at the difficulty's base; level 20 is bigger but bounded.
            assertThat(d.gridSizeFor(20)).isGreaterThan(d.gridSizeFor(1));
            assertThat(d.gridSizeFor(20) - d.gridSizeFor(1)).isLessThanOrEqualTo(3);
            assertThat(d.wordCountFor(20)).isGreaterThan(d.wordCountFor(1));
            // Later levels are worth more than earlier ones in the same difficulty.
            assertThat(d.pointsMultiplierFor(20)).isGreaterThan(d.pointsMultiplierFor(1));
        }
        // Harder difficulties pay more at the same level.
        assertThat(Difficulty.HARD.pointsMultiplierFor(1))
            .isGreaterThan(Difficulty.MEDIUM.pointsMultiplierFor(1))
            .isGreaterThan(Difficulty.EASY.pointsMultiplierFor(1));
        // Easy hides only straight forward lines; Hard allows diagonals + reversed.
        assertThat(Difficulty.EASY.allowDiagonal()).isFalse();
        assertThat(Difficulty.EASY.allowReverse()).isFalse();
        assertThat(Difficulty.HARD.allowDiagonal()).isTrue();
        assertThat(Difficulty.HARD.allowReverse()).isTrue();
    }

    @Test
    void score_scalesByDifficultyAndLevel() {
        int plain  = scoreEngine.calculate(GameType.WORD_SEARCH, 1, true);
        int easyL1 = scoreEngine.calculate(GameType.WORD_SEARCH, 1, true, Difficulty.EASY, 1);
        int hardL20 = scoreEngine.calculate(GameType.WORD_SEARCH, 1, true, Difficulty.HARD, 20);

        assertThat(easyL1).isEqualTo(plain);              // Easy L1 multiplier is 1.0
        assertThat(hardL20).isGreaterThan(easyL1);        // Hard, late level pays far more
        // null difficulty leaves the score untouched.
        assertThat(scoreEngine.calculate(GameType.WORD_SEARCH, 1, true, null, 0)).isEqualTo(plain);
    }

    // ── Locked-ladder guard ───────────────────────────────────────────────────

    @Test
    void requireUnlocked_blocksLockedLevels() {
        LevelService svc = new LevelService(repo);
        UUID user = UUID.randomUUID();
        when(repo.findByUserIdAndGameTypeAndDifficulty(any(), eq("WORD_SEARCH"), eq(Difficulty.EASY)))
            .thenReturn(Optional.empty());   // brand-new player → only level 1 unlocked

        assertThatCode(() -> svc.requireUnlocked(user, GameType.WORD_SEARCH, Difficulty.EASY, 1))
            .doesNotThrowAnyException();
        assertThatThrownBy(() -> svc.requireUnlocked(user, GameType.WORD_SEARCH, Difficulty.EASY, 2))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> svc.requireUnlocked(user, GameType.WORD_SEARCH, Difficulty.EASY, 21))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordCompletion_unlocksNextAndKeepsBestScore() {
        LevelService svc = new LevelService(repo);
        UUID user = UUID.randomUUID();
        when(repo.findByUserIdAndGameTypeAndDifficulty(any(), eq("WORD_SEARCH"), eq(Difficulty.EASY)))
            .thenReturn(Optional.empty());

        svc.recordCompletion(user, GameType.WORD_SEARCH, Difficulty.EASY, 1, 1200);

        ArgumentCaptor<PlayerLevelProgress> cap = ArgumentCaptor.forClass(PlayerLevelProgress.class);
        verify(repo).save(cap.capture());
        PlayerLevelProgress saved = cap.getValue();
        assertThat(saved.getHighestUnlocked()).isEqualTo(2);            // level 1 cleared → 2 unlocked
        assertThat(saved.getBestScores()).containsEntry("1", 1200);
    }
}
