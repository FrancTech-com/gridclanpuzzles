package com.gridclan.service;

import com.gridclan.repository.BattleshipGameRepository;
import com.gridclan.repository.ChessGameRepository;
import com.gridclan.repository.GomokuGameRepository;
import com.gridclan.repository.MonopolyGameRepository;
import com.gridclan.repository.ScrabbleGameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.UUID;

/**
 * Resolves the players of a real-time game by kind + id. Shared by the
 * in-game voice and chat relays so a stranger can't signal or post into a
 * game they aren't part of. Multi-player games (4-player Scrabble groups,
 * Monopoly tables) return every seat.
 *
 * kind ∈ { scrabble, gomoku, battleship, chess, monopoly }.
 */
@Service
@RequiredArgsConstructor
public class GameParticipantResolver {

    private final ScrabbleGameRepository   scrabbleRepo;
    private final GomokuGameRepository     gomokuRepo;
    private final BattleshipGameRepository battleshipRepo;
    private final ChessGameRepository      chessRepo;
    private final MonopolyGameRepository   monopolyRepo;

    /** All seated player ids (entries may be null while waiting), or null if unknown. */
    public UUID[] participants(String kind, UUID gameId) {
        return switch (kind) {
            case "scrabble"   -> scrabbleRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id(), g.getPlayer3Id(), g.getPlayer4Id() })
                .orElse(null);
            case "gomoku"     -> gomokuRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            case "battleship" -> battleshipRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            case "chess"      -> chessRepo.findById(gameId)
                .map(g -> new UUID[]{ g.getPlayer1Id(), g.getPlayer2Id() }).orElse(null);
            case "monopoly"   -> monopolyRepo.findById(gameId)
                .map(g -> Arrays.stream(g.getPlayersCsv().split(","))
                    .map(UUID::fromString).toArray(UUID[]::new))
                .orElse(null);
            default -> null;
        };
    }

    /** True if userId is seated in the game. */
    public boolean isParticipant(String kind, UUID gameId, UUID userId) {
        UUID[] p = participants(kind, gameId);
        if (p == null) return false;
        for (UUID id : p) if (userId.equals(id)) return true;
        return false;
    }
}
