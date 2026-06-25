package com.gridclan.repository;

import com.gridclan.entity.Challenge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChallengeRepository extends JpaRepository<Challenge, UUID> {
    Optional<Challenge> findByCode(String code);
    boolean existsByCode(String code);
}
