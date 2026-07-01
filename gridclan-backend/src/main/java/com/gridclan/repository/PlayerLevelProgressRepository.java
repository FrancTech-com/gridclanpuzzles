package com.gridclan.repository;

import com.gridclan.entity.PlayerLevelProgress;
import com.gridclan.entity.enums.Difficulty;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerLevelProgressRepository extends JpaRepository<PlayerLevelProgress, UUID> {

    List<PlayerLevelProgress> findByUserIdAndGameType(UUID userId, String gameType);

    Optional<PlayerLevelProgress> findByUserIdAndGameTypeAndDifficulty(
        UUID userId, String gameType, Difficulty difficulty);
}
