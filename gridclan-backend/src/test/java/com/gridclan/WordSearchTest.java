package com.gridclan;

import com.gridclan.service.GameBoardGenerator;
import com.gridclan.service.WordSearch;
import org.junit.jupiter.api.*;

import java.util.*;

import static org.assertj.core.api.Assertions.*;

class WordSearchTest {

    @Test @DisplayName("generate(): fills a full grid, places words, none found yet")
    @SuppressWarnings("unchecked")
    void generate_producesPlayableBoard() {
        var board = WordSearch.generate(new Random(42));

        assertThat(board.get("type")).isEqualTo("WORD_SEARCH");
        List<String> grid  = (List<String>) board.get("grid");
        List<String> words = (List<String>) board.get("words");
        List<String> found = (List<String>) board.get("found");

        assertThat(grid).isNotEmpty();
        int width = grid.get(0).length();
        assertThat(grid).allSatisfy(row -> assertThat(row).hasSize(width)
            .matches("[A-Z]+"));               // square, fully filled, uppercase only
        assertThat(grid).hasSize(width);
        assertThat(words).isNotEmpty();
        assertThat(found).isEmpty();
        assertThat(board.get("solved")).isEqualTo(false);

        // Every placed word must actually be locatable in the grid.
        for (String w : words) assertThat(WordSearch.locate(grid, w)).isNotNull();
    }

    @Test @DisplayName("applyMove(): a correct selection marks the word found")
    @SuppressWarnings("unchecked")
    void applyMove_correctSelection_marksFound() {
        // CLAN hidden down the first column.
        var board = board(List.of("CXXX", "LXXX", "AXXX", "NXXX"), List.of("CLAN"));
        var move  = Map.of("fromRow", 0, "fromCol", 0, "toRow", 3, "toCol", 0);

        GameBoardGenerator.MoveResult res = WordSearch.applyMove(board, move);

        assertThat((List<String>) res.getState().get("found")).containsExactly("CLAN");
        assertThat(res.isSolved()).isTrue();   // only one word → solved
    }

    @Test @DisplayName("applyMove(): a reversed selection still matches")
    @SuppressWarnings("unchecked")
    void applyMove_reversed_matches() {
        var board = board(List.of("CLAN", "XXXX", "XXXX", "XXXX"), List.of("CLAN"));
        var move  = Map.of("fromRow", 0, "fromCol", 3, "toRow", 0, "toCol", 0);  // right→left

        var res = WordSearch.applyMove(board, move);
        assertThat((List<String>) res.getState().get("found")).containsExactly("CLAN");
    }

    @Test @DisplayName("applyMove(): a wrong selection is a harmless no-op")
    @SuppressWarnings("unchecked")
    void applyMove_wrongSelection_noop() {
        var board = board(List.of("CLAN", "ZZZZ", "XXXX", "XXXX"), List.of("CLAN"));
        var move  = Map.of("fromRow", 1, "fromCol", 0, "toRow", 1, "toCol", 3);  // "ZZZZ"

        var res = WordSearch.applyMove(board, move);
        assertThat((List<String>) res.getState().get("found")).isEmpty();
        assertThat(res.isSolved()).isFalse();
    }

    @Test @DisplayName("isLegalLine(): straight ok, non-straight rejected")
    void isLegalLine_geometry() {
        var board = board(List.of("ABCD", "EFGH", "IJKL", "MNOP"), List.of("ABCD"));
        assertThat(WordSearch.isLegalLine(board, Map.of("fromRow", 0, "fromCol", 0, "toRow", 3, "toCol", 3))).isTrue();  // diagonal
        assertThat(WordSearch.isLegalLine(board, Map.of("fromRow", 0, "fromCol", 0, "toRow", 1, "toCol", 2))).isFalse(); // knight
        assertThat(WordSearch.isLegalLine(board, Map.of("fromRow", 0, "fromCol", 0, "toRow", 0, "toCol", 9))).isFalse(); // off-grid
    }

    private Map<String, Object> board(List<String> grid, List<String> words) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("type", "WORD_SEARCH");
        b.put("rows", grid.size());
        b.put("cols", grid.get(0).length());
        b.put("grid", new ArrayList<>(grid));
        b.put("words", new ArrayList<>(words));
        b.put("found", new ArrayList<String>());
        b.put("solved", false);
        return b;
    }
}
