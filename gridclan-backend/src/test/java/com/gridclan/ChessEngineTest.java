package com.gridclan;

import com.gridclan.chess.ChessEngine;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Chess rules engine: legality, special moves and game-over detection. */
class ChessEngineTest {

    @Test
    void startPositionHasTwentyMovesAndRoundTripsFen() {
        ChessEngine e = ChessEngine.fromFen(ChessEngine.START_FEN);
        assertThat(e.legalMoves()).hasSize(20);
        assertThat(e.inCheck()).isFalse();
        assertThat(e.toFen()).isEqualTo(ChessEngine.START_FEN);
        assertThat(e.status()).isEqualTo("ACTIVE");
    }

    @Test
    void scholarsMateIsCheckmate() {
        ChessEngine e = ChessEngine.fromFen(ChessEngine.START_FEN);
        for (String mv : List.of("e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7")) {
            assertThat(e.legalMoves()).contains(mv);
            e.applyUci(mv);
        }
        assertThat(e.inCheck()).isTrue();
        assertThat(e.status()).isEqualTo("CHECKMATE");
        assertThat(e.legalMoves()).isEmpty();
    }

    @Test
    void castlingMovesTheRookAndIsBlockedThroughCheck() {
        // White king + rook ready to castle kingside; black rook eyes f1 → castling barred.
        ChessEngine barred = ChessEngine.fromFen("5r2/8/8/8/8/8/8/4K2R w K - 0 1");
        assertThat(barred.legalMoves()).doesNotContain("e1g1");

        ChessEngine ok = ChessEngine.fromFen("8/8/8/8/8/8/8/4K2R w K - 0 1");
        assertThat(ok.legalMoves()).contains("e1g1");
        ok.applyUci("e1g1");
        assertThat(ok.rows().get(7)).isEqualTo("....." + "RK.");   // f1 rook, g1 king
    }

    @Test
    void enPassantCapturesTheBypassingPawn() {
        ChessEngine e = ChessEngine.fromFen(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        e.applyUci("e2e4");
        e.applyUci("a7a6");
        e.applyUci("e4e5");
        e.applyUci("d7d5");                       // double push beside the e5 pawn
        assertThat(e.legalMoves()).contains("e5d6");
        e.applyUci("e5d6");
        // The d5 pawn is gone and the white pawn sits on d6.
        assertThat(e.rows().get(2).charAt(3)).isEqualTo('P');
        assertThat(e.rows().get(3).charAt(3)).isEqualTo('.');
    }

    @Test
    void promotionMintsTheChosenPiece() {
        ChessEngine e = ChessEngine.fromFen("8/P7/8/8/8/8/8/K6k w - - 0 1");
        assertThat(e.legalMoves()).contains("a7a8q");
        e.applyUci("a7a8q");
        assertThat(e.rows().get(0).charAt(0)).isEqualTo('Q');
    }

    @Test
    void stalemateAndInsufficientMaterialAreDraws() {
        // Classic stalemate: black king a8, white queen c7 (guarded), white king c6 — black to move.
        ChessEngine stale = ChessEngine.fromFen("k7/2Q5/2K5/8/8/8/8/8 b - - 0 1");
        assertThat(stale.status()).isEqualTo("STALEMATE");

        ChessEngine bare = ChessEngine.fromFen("k7/8/8/8/8/8/8/K7 w - - 0 1");
        assertThat(bare.status()).isEqualTo("DRAW_MATERIAL");
    }
}
