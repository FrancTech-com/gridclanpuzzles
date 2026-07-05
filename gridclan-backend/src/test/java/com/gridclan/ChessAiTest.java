package com.gridclan;

import com.gridclan.chess.ChessEngine;
import com.gridclan.service.ChessAi;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The chess AI should play legal moves, grab free material, and find mate-in-1. */
class ChessAiTest {

    private final ChessAi ai = new ChessAi();

    @Test
    void alwaysReturnsALegalMoveFromTheStart() {
        ChessEngine e = ChessEngine.fromFen(ChessEngine.START_FEN);
        String mv = ai.bestMove(e, 0.0);
        assertThat(mv).isNotNull();
        assertThat(e.legalMoves()).contains(mv);
    }

    @Test
    void capturesAFreeQueen() {
        // White queen on d5 is hanging to the black e6 pawn (e6xd5) — take it.
        ChessEngine e = ChessEngine.fromFen("4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1");
        String mv = ai.bestMove(e, 0.0);
        assertThat(mv).isEqualTo("e6d5");
    }

    @Test
    void findsMateInOne() {
        // Back-rank mate: Ra1-a8# (black king boxed in by its own f7/g7/h7 pawns).
        ChessEngine e = ChessEngine.fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
        String mv = ai.bestMove(e, 0.0);
        e.applyUci(mv);
        assertThat(e.status()).isEqualTo("CHECKMATE");
    }

    @Test
    void blunderChanceStillYieldsALegalMove() {
        ChessEngine e = ChessEngine.fromFen(ChessEngine.START_FEN);
        for (int i = 0; i < 20; i++) {
            String mv = ai.bestMove(e, 1.0);   // always "blunder" (random legal move)
            assertThat(e.legalMoves()).contains(mv);
        }
    }
}
