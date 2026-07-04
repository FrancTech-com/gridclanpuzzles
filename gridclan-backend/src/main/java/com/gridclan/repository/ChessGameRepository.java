package com.gridclan.repository;

import com.gridclan.entity.ChessGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChessGameRepository extends JpaRepository<ChessGame, UUID> {
    Optional<ChessGame> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
    List<ChessGame> findByStatus(String status);

    /** The user's in-progress games (either colour), most-recently-active first. */
    @Query("SELECT g FROM ChessGame g WHERE (g.player1Id = :uid OR g.player2Id = :uid) "
         + "AND g.status IN :statuses ORDER BY g.lastMoveAt DESC")
    List<ChessGame> findResumable(@Param("uid") UUID uid, @Param("statuses") Collection<String> statuses);
}
