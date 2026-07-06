package com.gridclan.repository;

import com.gridclan.entity.ScrabbleGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * Locking fetch used when seating a joining player: a PESSIMISTIC_WRITE lock
     * serializes concurrent joins to the same game so two friends tapping "join"
     * at once can't both grab the same seat (which dropped one of them).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM ScrabbleGame g WHERE g.inviteCode = :code")
    Optional<ScrabbleGame> findByInviteCodeForUpdate(@Param("code") String code);
    boolean existsByInviteCode(String inviteCode);
    List<ScrabbleGame> findByStatus(String status);

    /** The user's in-progress games (any seat), most-recently-active first. */
    @Query("SELECT g FROM ScrabbleGame g WHERE (g.player1Id = :uid OR g.player2Id = :uid "
         + "OR g.player3Id = :uid OR g.player4Id = :uid) "
         + "AND g.status IN :statuses ORDER BY g.lastMoveAt DESC")
    List<ScrabbleGame> findResumable(@Param("uid") UUID uid, @Param("statuses") Collection<String> statuses);
}
