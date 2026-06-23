package com.gridclan.repository;

import com.gridclan.entity.PlayerPoints;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlayerPointsRepository extends JpaRepository<PlayerPoints, UUID> {
    Optional<PlayerPoints> findByUserId(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PlayerPoints p WHERE p.userId = :userId")
    Optional<PlayerPoints> findByUserIdForUpdate(@Param("userId") UUID userId);

    @Modifying
    @Query("UPDATE PlayerPoints p SET p.balance = 0, p.updatedAt = :now WHERE p.userId = :userId")
    void zeroOutBalance(@Param("userId") UUID userId, @Param("now") Instant now);
}
