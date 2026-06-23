package com.gridclan.repository;

import com.gridclan.entity.CommunityMember;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;
import java.util.Optional;

@Repository
public interface CommunityMemberRepository extends JpaRepository<CommunityMember, UUID> {
    @Query("SELECT COUNT(m) FROM CommunityMember m WHERE m.communityId = :cid AND m.isActive = true")
    long countActiveMembers(@Param("cid") UUID communityId);

    @Query("SELECT m.userId FROM CommunityMember m WHERE m.communityId = :cid AND m.isActive = true")
    List<UUID> findActiveMemberIds(@Param("cid") UUID communityId, Pageable pageable);

    @Query("SELECT c FROM CommunityMember c WHERE c.communityId = :cid AND c.userId = :uid")
Optional<CommunityMember> findByCommunityIdAndUserId(@Param("cid") UUID communityId, @Param("uid") UUID userId);

    @Modifying
    @Query("DELETE FROM CommunityMember m WHERE m.userId = :userId")
    void deleteAllByUserId(@Param("userId") UUID userId);
}
