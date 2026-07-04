package com.gridclan.job;

import com.gridclan.service.BattleshipGameService;
import com.gridclan.service.ChessGameService;
import com.gridclan.service.GomokuGameService;
import com.gridclan.service.MonopolyGameService;
import com.gridclan.service.ScrabbleGameService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * PvP turn clock enforcement (friend + tournament games; never solo).
 *
 * Every player gets 5 minutes per turn. Clients show a live countdown and the
 * game services also enforce the clock lazily on every fetch; this sweep is
 * the backstop that keeps games moving even when nobody has the board open —
 * a lapsed turn auto-passes (Scrabble logs a TIMEOUT pass; Gomoku/Battleship
 * hand the turn over; Chess, once wired in, is a loss on time).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TurnTimerJob {

    private final ScrabbleGameService   scrabble;
    private final GomokuGameService     gomoku;
    private final BattleshipGameService battleship;
    private final ChessGameService      chess;
    private final MonopolyGameService   monopoly;

    @Scheduled(fixedDelay = 30_000, initialDelay = 30_000)
    public void sweep() {
        try {
            int n = scrabble.sweepTurnClocks()
                  + gomoku.sweepTurnClocks()
                  + battleship.sweepTurnClocks()
                  + chess.sweepTurnClocks()
                  + monopoly.sweepTurnClocks();
            if (n > 0) log.info("Turn clock sweep advanced {} game(s)", n);
        } catch (Exception e) {
            log.warn("Turn clock sweep failed: {}", e.getMessage());
        }
    }
}
