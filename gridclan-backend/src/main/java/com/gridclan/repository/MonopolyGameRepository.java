package com.gridclan.repository;

import com.gridclan.entity.MonopolyGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MonopolyGameRepository extends JpaRepository<MonopolyGame, UUID> {
    List<MonopolyGame> findByStatus(String status);
}
