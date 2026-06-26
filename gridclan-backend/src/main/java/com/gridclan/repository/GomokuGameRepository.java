package com.gridclan.repository;

import com.gridclan.entity.GomokuGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GomokuGameRepository extends JpaRepository<GomokuGame, UUID> {
    Optional<GomokuGame> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
}
