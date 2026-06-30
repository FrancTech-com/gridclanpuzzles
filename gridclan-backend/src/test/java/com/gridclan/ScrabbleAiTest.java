package com.gridclan;

import com.gridclan.gridscrabble.MoveValidator;
import com.gridclan.gridscrabble.Placement;
import com.gridclan.gridscrabble.ScrabbleBoard;
import com.gridclan.gridscrabble.WordList;
import com.gridclan.service.ScrabbleAi;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Scrabble AI must only ever propose moves the authoritative MoveValidator
 * accepts. These tests use a tiny in-memory dictionary (no Spring, no Redis).
 */
class ScrabbleAiTest {

    private static final WordList DICT = new WordList(Set.of(
        "CAT", "CATS", "AT", "AS", "SAT", "HE", "HEN", "HELLO", "ELM", "OLD", "DOG"
    ));

    @Test
    void firstMovePlaysALegalWordThroughTheCentre() {
        ScrabbleBoard board = new ScrabbleBoard();
        ScrabbleAi ai = new ScrabbleAi();

        List<Placement> move = ai.bestMove(board, "CATZQXK", DICT);   // rack can form CAT/CATS/AT
        assertThat(move).isNotNull().isNotEmpty();

        MoveValidator.Result res = MoveValidator.validate(board, move, DICT);
        assertThat(res.valid()).isTrue();
        // a first move must cover the centre star
        assertThat(move.stream().anyMatch(p -> p.row() == 7 && p.col() == 7)).isTrue();
    }

    @Test
    void laterMoveHooksThroughAnExistingWordLegally() {
        ScrabbleBoard board = new ScrabbleBoard();
        board.place(7, 6, 'C', false);   // CAT across the centre
        board.place(7, 7, 'A', false);
        board.place(7, 8, 'T', false);

        ScrabbleAi ai = new ScrabbleAi();
        List<Placement> move = ai.bestMove(board, "SOXQZKW", DICT);   // S can make CATS / AS / SAT
        assertThat(move).isNotNull().isNotEmpty();

        MoveValidator.Result res = MoveValidator.validate(board, move, DICT);
        assertThat(res.valid()).isTrue();
        assertThat(move.stream().allMatch(p -> !board.has(p.row(), p.col()))).isTrue(); // only new cells
    }

    @Test
    void returnsNullWhenNoMoveIsPossible() {
        ScrabbleBoard board = new ScrabbleBoard();
        ScrabbleAi ai = new ScrabbleAi();
        // Rack of letters that can't form any word in this dictionary on an empty board.
        List<Placement> move = ai.bestMove(board, "QQQQZZZ", DICT);
        assertThat(move).isNull();
    }
}
