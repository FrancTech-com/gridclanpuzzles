package com.gridclan.repository;

import com.gridclan.entity.ScrabbleGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Read-only aggregate queries for the player achievements / stats screen.
 * Anchored on ScrabbleGame only to satisfy Spring Data — the native query
 * spans all three PvP game tables.
 */
@Repository
public interface PlayerStatsRepository extends JpaRepository<ScrabbleGame, UUID> {

    /**
     * Win/loss/draw record for one user, per game type and play mode.
     * Rows: [game_type, play_mode(SOLO|FRIEND|TOURNAMENT), wins, losses, draws].
     *
     * A game counts once it is COMPLETE and the user held either seat.
     * Mode: vs_computer → SOLO; created by the bracket (present in
     * tournament_matches) → TOURNAMENT; anything else → FRIEND.
     * winner_id NULL on a COMPLETE game means a draw.
     */
    @Query(value = """
        SELECT g.game_type,
               CASE WHEN g.vs_computer          THEN 'SOLO'
                    WHEN tm.game_id IS NOT NULL THEN 'TOURNAMENT'
                    ELSE 'FRIEND' END                                                          AS play_mode,
               SUM(CASE WHEN g.winner_id = :uid THEN 1 ELSE 0 END)                             AS wins,
               SUM(CASE WHEN g.winner_id IS NOT NULL AND g.winner_id <> :uid THEN 1 ELSE 0 END) AS losses,
               SUM(CASE WHEN g.winner_id IS NULL THEN 1 ELSE 0 END)                            AS draws
        FROM (
            SELECT 'SCRABBLE'   AS game_type, id, player1_id, player2_id, player3_id, player4_id, winner_id, vs_computer, status FROM scrabble_games
            UNION ALL
            SELECT 'GOMOKU'     AS game_type, id, player1_id, player2_id, NULL AS player3_id, NULL AS player4_id, winner_id, vs_computer, status FROM gomoku_games
            UNION ALL
            SELECT 'BATTLESHIP' AS game_type, id, player1_id, player2_id, NULL AS player3_id, NULL AS player4_id, winner_id, vs_computer, status FROM battleship_games
            UNION ALL
            SELECT 'CHESS'      AS game_type, id, player1_id, player2_id, NULL AS player3_id, NULL AS player4_id, winner_id, FALSE AS vs_computer, status FROM chess_games
        ) g
        LEFT JOIN tournament_matches tm ON tm.game_id = g.id
        WHERE g.status = 'COMPLETE'
          AND (g.player1_id = :uid OR g.player2_id = :uid OR g.player3_id = :uid OR g.player4_id = :uid)
        GROUP BY g.game_type,
                 CASE WHEN g.vs_computer          THEN 'SOLO'
                      WHEN tm.game_id IS NOT NULL THEN 'TOURNAMENT'
                      ELSE 'FRIEND' END

        UNION ALL

        SELECT 'MONOPOLY' AS game_type, 'TOURNAMENT' AS play_mode,
               SUM(CASE WHEN m.winner_id = :uid THEN 1 ELSE 0 END)                              AS wins,
               SUM(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id <> :uid THEN 1 ELSE 0 END) AS losses,
               SUM(CASE WHEN m.winner_id IS NULL THEN 1 ELSE 0 END)                             AS draws
        FROM monopoly_games m
        WHERE m.status = 'COMPLETE'
          AND POSITION(CAST(:uid AS VARCHAR(36)) IN m.players_csv) > 0
        HAVING COUNT(*) > 0
        """, nativeQuery = true)
    List<Object[]> winLossByGameAndMode(@Param("uid") UUID uid);
}
