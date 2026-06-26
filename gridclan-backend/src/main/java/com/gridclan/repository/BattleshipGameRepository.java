package com.gridclan.repository;

import com.gridclan.entity.BattleshipGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface BattleshipGameRepository extends JpaRepository<BattleshipGame, UUID> {
    Optional<BattleshipGame> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
}
