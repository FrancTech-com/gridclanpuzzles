package com.gridclan.service;

import com.gridclan.entity.PlayerLevelProgress;
import com.gridclan.entity.enums.Difficulty;
import com.gridclan.entity.enums.GameType;
import com.gridclan.repository.PlayerLevelProgressRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Difficulty-ladder progress: which levels a player has unlocked, and their best
 * score per level. The ladder is LOCKED — a player may only start a level up to
 * their {@code highestUnlocked} for that difficulty, enforced here server-side
 * (the client greying out tiles is UX only).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LevelService {

    private final PlayerLevelProgressRepository repo;

    // The four games that have difficulty ladders. WORD_SEARCH is a GameType enum
    // value; the other three are real-time games keyed only by their String name.
    public static final Set<String> LADDER_GAMES =
        Set.of("WORD_SEARCH", "GOMOKU", "BATTLESHIP", "SCRABBLE", "CHESS");

    // ── Reads ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getProgress(UUID userId, GameType gameType) {
        return getProgress(userId, gameType.name());
    }

    /**
     * Ladder state for every difficulty of a game, ready for the level-select UI.
     * Difficulties the player hasn't touched yet report level 1 unlocked, no scores.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getProgress(UUID userId, String key) {
        Map<Difficulty, PlayerLevelProgress> existing = new EnumMap<>(Difficulty.class);
        for (PlayerLevelProgress p : repo.findByUserIdAndGameType(userId, key)) {
            existing.put(p.getDifficulty(), p);
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (Difficulty d : Difficulty.values()) {
            PlayerLevelProgress p = existing.get(d);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("difficulty",      d.name());
            m.put("levels",          Difficulty.LEVELS);
            m.put("highestUnlocked", p != null ? p.getHighestUnlocked() : 1);
            m.put("bestScores",      p != null ? p.getBestScores() : Map.of());
            out.add(m);
        }
        return out;
    }

    // ── Locked-ladder guard ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public void requireUnlocked(UUID userId, GameType gameType, Difficulty difficulty, int level) {
        requireUnlocked(userId, gameType.name(), difficulty, level);
    }

    /** Throws if {@code level} is out of range or not yet unlocked for this player. */
    @Transactional(readOnly = true)
    public void requireUnlocked(UUID userId, String gameKey, Difficulty difficulty, int level) {
        if (difficulty == null || !Difficulty.validLevel(level)) {
            throw new IllegalArgumentException(
                "level must be between 1 and " + Difficulty.LEVELS);
        }
        int highest = repo.findByUserIdAndGameTypeAndDifficulty(userId, gameKey, difficulty)
            .map(PlayerLevelProgress::getHighestUnlocked)
            .orElse(1);
        if (level > highest) {
            throw new IllegalArgumentException(
                "Level " + level + " is locked. Finish level " + highest + " first.");
        }
    }

    // ── Completion ───────────────────────────────────────────────────────────

    /**
     * Record a solved ladder level: store the best score and, if this was the
     * furthest unlocked level, unlock the next one. Idempotent for replays of an
     * already-cleared level (only the best score can improve).
     */
    @Transactional
    public void recordCompletion(UUID userId, GameType gameType,
                                 Difficulty difficulty, int level, int score) {
        recordCompletion(userId, gameType.name(), difficulty, level, score);
    }

    @Transactional
    public void recordCompletion(UUID userId, String key,
                                 Difficulty difficulty, int level, int score) {
        if (difficulty == null || !Difficulty.validLevel(level)) return;

        PlayerLevelProgress p = repo
            .findByUserIdAndGameTypeAndDifficulty(userId, key, difficulty)
            .orElseGet(() -> PlayerLevelProgress.builder()
                .userId(userId).gameType(key).difficulty(difficulty)
                .highestUnlocked(1).bestScores(new HashMap<>()).build());

        // Mutable copy — the JSONB map from Hibernate may be immutable/shared.
        Map<String, Integer> scores = new HashMap<>(p.getBestScores());
        String lvlKey = String.valueOf(level);
        scores.merge(lvlKey, score, Math::max);
        p.setBestScores(scores);

        if (level == p.getHighestUnlocked() && level < Difficulty.LEVELS) {
            p.setHighestUnlocked(level + 1);
        }
        repo.save(p);
        log.info("Level cleared: userId={} game={} diff={} level={} score={} unlocked={}",
            userId, key, difficulty, level, score, p.getHighestUnlocked());
    }
}
