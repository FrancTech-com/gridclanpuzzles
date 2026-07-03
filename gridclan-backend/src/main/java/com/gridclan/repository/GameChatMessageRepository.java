package com.gridclan.repository;

import com.gridclan.entity.GameChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface GameChatMessageRepository extends JpaRepository<GameChatMessage, UUID> {

    /** Newest first — callers reverse to display oldest→newest. */
    List<GameChatMessage> findByKindAndGameIdOrderByCreatedAtDesc(String kind, UUID gameId, Pageable pageable);

    /** Nightly purge — game chat is throwaway, not an archive. */
    @Modifying
    @Query("DELETE FROM GameChatMessage m WHERE m.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
