package com.gridclan.repository;

import com.gridclan.entity.CommunityMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CommunityMessageRepository extends JpaRepository<CommunityMessage, UUID> {
    /** Most-recent messages first; the controller reverses to oldest→newest for display. */
    List<CommunityMessage> findTop200ByCommunityIdOrderBySentAtDesc(UUID communityId);
}
