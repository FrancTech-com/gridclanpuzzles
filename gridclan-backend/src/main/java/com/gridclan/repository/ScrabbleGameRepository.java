package com.gridclan.repository;

import com.gridclan.entity.ScrabbleGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ScrabbleGameRepository extends JpaRepository<ScrabbleGame, UUID> {
    Optional<ScrabbleGame> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
    List<ScrabbleGame> findByStatus(String status);

    /** The user's in-progress games (either seat), most-recently-active first. */
    @Query("SELECT g FROM ScrabbleGame g WHERE (g.player1Id = :uid OR g.player2Id = :uid) "
         + "AND g.status IN :statuses ORDER BY g.lastMoveAt DESC")
    List<ScrabbleGame> findResumable(@Param("uid") UUID uid, @Param("statuses") Collection<String> statuses);
}
