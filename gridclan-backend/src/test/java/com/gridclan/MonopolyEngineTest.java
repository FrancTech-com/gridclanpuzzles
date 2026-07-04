package com.gridclan;

import com.gridclan.monopoly.MonopolyBoard;
import com.gridclan.monopoly.MonopolyEngine;
import com.gridclan.monopoly.MonopolyState;
import com.gridclan.monopoly.MonopolyState.OwnedProp;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Monopoly rules engine: board data, turns, rent, building and bankruptcy. */
class MonopolyEngineTest {

    private static MonopolyState game(int players) {
        return MonopolyEngine.init(
            java.util.stream.IntStream.range(0, players)
                .mapToObj(i -> UUID.randomUUID().toString()).toList(), 42L);
    }

    @Test
    void boardIsTheStandardFortySquares() {
        assertThat(MonopolyBoard.SQUARES).hasSize(40);
        assertThat(MonopolyBoard.at(0).type()).isEqualTo("GO");
        assertThat(MonopolyBoard.at(39).name()).isEqualTo("Boardwalk");
        assertThat(MonopolyBoard.at(39).rent()[5]).isEqualTo(2000);
        assertThat(MonopolyBoard.group("RAIL")).hasSize(4);
        assertThat(MonopolyBoard.group("UTIL")).hasSize(2);
        assertThat(MonopolyBoard.group("DARK_BLUE")).hasSize(2);
    }

    @Test
    void eightSeatsStartWithCashAndTakeTurns() {
        MonopolyState s = game(8);
        assertThat(s.players).hasSize(8);
        assertThat(s.cash).allMatch(c -> c == MonopolyEngine.START_CASH);
        assertThat(s.current).isZero();
        assertThat(s.phase).isEqualTo("ROLL");

        assertThatThrownBy(() -> MonopolyEngine.roll(s, 3))
            .isInstanceOf(IllegalStateException.class);   // not their turn

        // Forced turns must always hand play to the next seat and never wedge.
        for (int i = 0; i < 30 && !s.over; i++) {
            int before = s.current;
            MonopolyEngine.forceTurn(s);
            assertThat(s.current).isNotEqualTo(-1);
            if (!s.over) assertThat(s.current).isNotEqualTo(before);
        }
    }

    @Test
    void rentFlowsFromVisitorToOwnerAndDoublesOnFullGroup() {
        MonopolyState s = game(2);
        // Give seat 1 both dark blues; drop seat 0 on Boardwalk (39).
        OwnedProp park = new OwnedProp(); park.owner = 1;
        OwnedProp walk = new OwnedProp(); walk.owner = 1;
        s.props.put("37", park);
        s.props.put("39", walk);
        s.pos.set(0, 34);
        s.lastRoll = new int[]{2, 3};

        int before0 = s.cash.get(0), before1 = s.cash.get(1);
        // Simulate landing via a forced move by placing directly and resolving through roll:
        // use the engine's own path: position 34 + 5 = 39.
        MonopolyEngine.rollForTest(s, 0, 2, 3);
        assertThat(s.pos.get(0)).isEqualTo(39);
        int rent = 50 * 2;   // Boardwalk base 50, doubled for the full group
        assertThat(s.cash.get(0)).isEqualTo(before0 - rent);
        assertThat(s.cash.get(1)).isEqualTo(before1 + rent);
    }

    @Test
    void buildingRequiresFullGroupAndEvenBuild() {
        MonopolyState s = game(2);
        OwnedProp park = new OwnedProp(); park.owner = 0;
        s.props.put("37", park);
        s.phase = "MANAGE";

        assertThatThrownBy(() -> MonopolyEngine.build(s, 0, 37))
            .hasMessageContaining("whole colour group");

        OwnedProp walk = new OwnedProp(); walk.owner = 0;
        s.props.put("39", walk);
        MonopolyEngine.build(s, 0, 37);
        assertThat(park.houses).isEqualTo(1);
        // Even-build: a second house on Park Place before Boardwalk has one is barred.
        assertThatThrownBy(() -> MonopolyEngine.build(s, 0, 37))
            .hasMessageContaining("evenly");
        MonopolyEngine.build(s, 0, 39);
        MonopolyEngine.build(s, 0, 37);
        assertThat(park.houses).isEqualTo(2);
    }

    @Test
    void unpayableDebtBankruptsAndHandsAssetsToTheCreditor() {
        MonopolyState s = game(2);
        OwnedProp walk = new OwnedProp(); walk.owner = 1; walk.houses = 5;
        s.props.put("39", walk);
        s.cash.set(0, 10);                          // can't cover hotel rent (2000)
        s.pos.set(0, 34);
        MonopolyEngine.rollForTest(s, 0, 2, 3);     // lands on Boardwalk

        assertThat(s.bankrupt.get(0)).isTrue();
        assertThat(s.over).isTrue();                // 2 players → game over
        assertThat(MonopolyEngine.ranking(s)).containsExactly(1, 0);
    }

    @Test
    void netWorthCountsPropertyAndBuildings() {
        MonopolyState s = game(2);
        OwnedProp walk = new OwnedProp(); walk.owner = 0; walk.houses = 2;
        s.props.put("39", walk);
        assertThat(MonopolyEngine.netWorth(s, 0))
            .isEqualTo(MonopolyEngine.START_CASH + 400 + 2 * 200 / 2);
    }

    @Test
    void ranksAliveByWorthThenLatestBankruptFirst() {
        MonopolyState s = game(3);
        s.cash.set(2, 5000);
        assertThat(MonopolyEngine.ranking(s)).containsExactly(2, 0, 1);
        assertThat(List.of(s.players.get(2))).isNotEmpty();
    }
}
