package com.gridclan;

import com.gridclan.gridscrabble.Letters;
import com.gridclan.gridscrabble.Premiums;
import com.gridclan.gridscrabble.TileBag;
import org.junit.jupiter.api.Test;

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
}
