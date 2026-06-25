package com.gridclan;

import com.gridclan.gridscrabble.Letters;
import com.gridclan.gridscrabble.MoveValidator;
import com.gridclan.gridscrabble.Placement;
import com.gridclan.gridscrabble.Premiums;
import com.gridclan.gridscrabble.ScrabbleBoard;
import com.gridclan.gridscrabble.TileBag;
import com.gridclan.gridscrabble.WordList;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Phase 1: deterministic Grid Scrabble engine foundations. */
class GridScrabbleEngineTest {

    @Test
    void distributionIsStandardHundredTileSet() {
        assertThat(Letters.totalTiles()).isEqualTo(100);
        assertThat(Letters.DISTRIBUTION.get('E')).isEqualTo(12);
        assertThat(Letters.DISTRIBUTION.get('A')).isEqualTo(9);
        assertThat(Letters.DISTRIBUTION.get(Letters.BLANK)).isEqualTo(2);
    }

    @Test
    void letterValuesAreStandard() {
        assertThat(Letters.value('A')).isEqualTo(1);
        assertThat(Letters.value('a')).isEqualTo(1);   // case-insensitive
        assertThat(Letters.value('Q')).isEqualTo(10);
        assertThat(Letters.value('Z')).isEqualTo(10);
        assertThat(Letters.value(Letters.BLANK)).isZero();
    }

    @Test
    void premiumLayoutHasCorrectCornersAndCentre() {
        assertThat(Premiums.at(0, 0)).isEqualTo(Premiums.Type.TRIPLE_WORD);
        assertThat(Premiums.at(14, 14)).isEqualTo(Premiums.Type.TRIPLE_WORD);
        assertThat(Premiums.at(Premiums.CENTER, Premiums.CENTER)).isEqualTo(Premiums.Type.DOUBLE_WORD);
        assertThat(Premiums.isCenter(7, 7)).isTrue();
        assertThat(Premiums.at(0, 3)).isEqualTo(Premiums.Type.DOUBLE_LETTER);
        assertThat(Premiums.at(1, 5)).isEqualTo(Premiums.Type.TRIPLE_LETTER);
    }

    @Test
    void bagIsDeterministicAndDrawsSevenThenDepletes() {
        TileBag a = new TileBag(42L);
        TileBag b = new TileBag(42L);
        assertThat(a.remaining()).isEqualTo(100);

        List<Character> rackA = a.draw(TileBag.RACK_SIZE);
        List<Character> rackB = b.draw(TileBag.RACK_SIZE);
        assertThat(rackA).hasSize(7).isEqualTo(rackB);   // same seed → same draw
        assertThat(a.remaining()).isEqualTo(93);

        a.draw(1000); // over-draw past the end
        assertThat(a.isEmpty()).isTrue();
        assertThat(a.draw(5)).isEmpty();
    }

    // ── Move validation / scoring ──────────────────────────────────────────

    private static final WordList DICT =
        new WordList(new HashSet<>(Arrays.asList("HELLO", "HELLOS", "HI")));

    private static List<Placement> line(int r, int c, boolean horiz, String s) {
        List<Placement> ps = new ArrayList<>();
        for (int i = 0; i < s.length(); i++) {
            ps.add(new Placement(horiz ? r : r + i, horiz ? c + i : c, s.charAt(i), false));
        }
        return ps;
    }

    @Test
    void firstWordMustCrossCentreAndScoresWithDoubleWord() {
        ScrabbleBoard b = new ScrabbleBoard();
        // HELLO across cols 5..9 on row 7 covers the centre (7,7) double-word.
        var r = MoveValidator.validate(b, line(7, 5, true, "HELLO"), DICT);
        assertThat(r.valid()).isTrue();
        assertThat(r.words()).containsExactly("HELLO");
        assertThat(r.score()).isEqualTo(16); // (4+1+1+1+1) * 2
    }

    @Test
    void rejectsDisconnectedNonWordAndSingleTileFirstMove() {
        ScrabbleBoard b = new ScrabbleBoard();
        assertThat(MoveValidator.validate(b, List.of(new Placement(7, 7, 'A', false)), DICT).valid()).isFalse();

        // Commit HELLO, then a far-away play must be rejected (not connected).
        for (Placement p : line(7, 5, true, "HELLO")) b.place(p.row(), p.col(), p.letter(), p.blank());
        assertThat(MoveValidator.validate(b, line(0, 0, true, "HI"), DICT).valid()).isFalse();

        // Extending HELLO -> HELLOS connects and is valid.
        var ext = MoveValidator.validate(b, List.of(new Placement(7, 10, 'S', false)), DICT);
        assertThat(ext.valid()).isTrue();
        assertThat(ext.words()).containsExactly("HELLOS");
    }
}
