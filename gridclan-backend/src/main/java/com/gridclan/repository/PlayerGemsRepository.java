package com.gridclan.repository;

import com.gridclan.entity.PlayerGems;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlayerGemsRepository extends JpaRepository<PlayerGems, UUID> {

    Optional<PlayerGems> findByUserId(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM PlayerGems g WHERE g.userId = :userId")
    Optional<PlayerGems> findByUserIdForUpdate(@Param("userId") UUID userId);

    @Modifying
    @Query("UPDATE PlayerGems g SET g.balance = 0, g.updatedAt = :now WHERE g.userId = :userId")
    void zeroOutBalance(@Param("userId") UUID userId, @Param("now") Instant now);
}
