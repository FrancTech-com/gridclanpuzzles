package com.gridclan.service;

import com.gridclan.repository.BattleshipGameRepository;
import com.gridclan.repository.GomokuGameRepository;
import com.gridclan.repository.ScrabbleGameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Resolves the two players of a real-time 2-player game by kind + id.
 * Shared by the in-game voice and chat relays so a stranger can't signal or
 * post into a game they aren't part of.
 *
 * kind ∈ { scrabble, gomoku, battleship }.
 */
@Service
@RequiredArgsConstructor
public class GameParticipantResolver {

    private final ScrabbleGameRepository   scrabbleRepo;
    private final GomokuGameRepository     gomokuRepo;
    private final BattleshipGameRepository battleshipRepo;

    /** [player1Id, player2Id] (player2 may be null while waiting), or null if unknown. */
    public UUID[] participants(String kind, UUID gameId) {
        return switch (kind) {
            case "scrabble"   -> scrabbleRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            case "gomoku"     -> gomokuRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            case "battleship" -> battleshipRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            default -> null;
        };
    }

    /** True if userId is one of the two players of the game. */
    public boolean isParticipant(String kind, UUID gameId, UUID userId) {
        UUID[] p = participants(kind, gameId);
        return p != null && (userId.equals(p[0]) || userId.equals(p[1]));
    }
}
