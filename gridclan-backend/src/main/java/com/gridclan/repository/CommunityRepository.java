package com.gridclan.repository;

import com.gridclan.entity.Community;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface CommunityRepository extends JpaRepository<Community, UUID> {
    boolean existsByName(String name);

    Page<Community> findByIsActiveTrueOrderByMemberCountDesc(Pageable pageable);

    @Query("SELECT m.communityId FROM CommunityMember m WHERE m.userId = :uid AND m.isActive = true")
    List<UUID> findCommunityIdsByMember(@Param("uid") UUID userId);

    @Query("SELECT c FROM Community c WHERE c.weeklyPoolPts > 0 AND c.isActive = true")
    List<Community> findAllWithPositivePool();

    @Modifying
    @Query("UPDATE Community c SET c.weeklyPoolPts = 0, c.updatedAt = :now WHERE c.id = :id")
    void resetWeeklyPool(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE Community c SET c.memberCount = c.memberCount + 1, c.updatedAt = :now WHERE c.id = :id")
    void incrementMemberCount(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE Community c SET c.memberCount = CASE WHEN c.memberCount > 0 THEN c.memberCount - 1 ELSE 0 END, " +
           "c.updatedAt = :now WHERE c.id = :id")
    void decrementMemberCount(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE Community c SET c.ownerId = :newOwner WHERE c.ownerId = :oldOwner")
    void reassignOwner(@Param("oldOwner") UUID oldOwner, @Param("newOwner") UUID newOwner);
}
