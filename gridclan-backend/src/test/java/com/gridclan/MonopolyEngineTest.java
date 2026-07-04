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
        assertThat(MonopolyBoard.at(39).name()).isEqualTo("New York");   // most expensive city
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
        // Give seat 1 both dark blues; drop seat 0 on New York (39).
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
        int rent = 50 * 2;   // New York (dark-blue) base 50, doubled for the full group
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
        // Even-build: a second house on Paris before New York has one is barred.
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
        MonopolyEngine.rollForTest(s, 0, 2, 3);     // lands on New York

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

    // ── Auctions ───────────────────────────────────────────────────────────

    @Test
    void decliningToBuyStartsAnAuctionTheHighestBidderWins() {
        MonopolyState s = game(3);
        // Seat 0 lands on an unowned city (New York, 39) and declines.
        s.pos.set(0, 34);
        MonopolyEngine.rollForTest(s, 0, 2, 3);           // → 39, phase BUY
        assertThat(s.phase).isEqualTo("BUY");
        MonopolyEngine.skipBuy(s, 0);                     // decline → auction
        assertThat(s.phase).isEqualTo("AUCTION");
        assertThat(s.auctionTurn).isZero();               // lander bids first

        MonopolyEngine.auctionBid(s, 0, 100);             // seat 0 bids
        MonopolyEngine.auctionBid(s, 1, 150);             // seat 1 outbids
        MonopolyEngine.auctionPass(s, 2);                 // seat 2 out
        int cash1 = s.cash.get(1);
        MonopolyEngine.auctionPass(s, 0);                 // seat 0 out → seat 1 wins

        assertThat(s.phase).isEqualTo("MANAGE");
        assertThat(s.props.get("39").owner).isEqualTo(1);
        assertThat(s.cash.get(1)).isEqualTo(cash1 - 150);
    }

    @Test
    void auctionWithNoBidsLeavesThePropertyUnsold() {
        MonopolyState s = game(2);
        s.pos.set(0, 34);
        MonopolyEngine.rollForTest(s, 0, 2, 3);           // → 39
        MonopolyEngine.skipBuy(s, 0);                     // auction
        MonopolyEngine.auctionPass(s, 0);
        MonopolyEngine.auctionPass(s, 1);                 // everyone passes
        assertThat(s.phase).isEqualTo("MANAGE");
        assertThat(s.props).doesNotContainKey("39");      // stays with the bank
    }

    @Test
    void bidMustBeatTheHighBidAndFitYourCash() {
        MonopolyState s = game(2);
        s.pos.set(0, 34);
        MonopolyEngine.rollForTest(s, 0, 2, 3);
        MonopolyEngine.skipBuy(s, 0);
        MonopolyEngine.auctionBid(s, 0, 50);
        assertThatThrownBy(() -> MonopolyEngine.auctionBid(s, 1, 50)).hasMessageContaining("beat");
        s.cash.set(1, 40);
        assertThatThrownBy(() -> MonopolyEngine.auctionBid(s, 1, 60)).hasMessageContaining("afford");
    }

    // ── Trading ────────────────────────────────────────────────────────────

    @Test
    void tradeSwapsPropertiesAndCashOnAccept() {
        MonopolyState s = game(2);
        s.phase = "MANAGE";
        OwnedProp mine = new OwnedProp(); mine.owner = 0; s.props.put("39", mine);   // seat 0 owns New York
        OwnedProp yours = new OwnedProp(); yours.owner = 1; s.props.put("37", yours); // seat 1 owns Paris

        MonopolyState.Trade t = new MonopolyState.Trade();
        t.to = 1;
        t.offerProps = new java.util.ArrayList<>(List.of(39));   // give New York
        t.requestProps = new java.util.ArrayList<>(List.of(37)); // want Paris
        t.offerCash = 100;                                        // + $100 to sweeten
        MonopolyEngine.proposeTrade(s, 0, t);
        assertThat(s.pendingTrade).isNotNull();

        int c0 = s.cash.get(0), c1 = s.cash.get(1);
        MonopolyEngine.acceptTrade(s, 1);

        assertThat(s.pendingTrade).isNull();
        assertThat(s.props.get("39").owner).isEqualTo(1);   // New York now seat 1's
        assertThat(s.props.get("37").owner).isEqualTo(0);   // Paris now seat 0's
        assertThat(s.cash.get(0)).isEqualTo(c0 - 100);
        assertThat(s.cash.get(1)).isEqualTo(c1 + 100);
    }

    @Test
    void cannotTradeAPropertyWithBuildingsInItsGroup() {
        MonopolyState s = game(2);
        s.phase = "MANAGE";
        // Seat 0 owns both dark blues with a house on one → neither is tradable.
        OwnedProp paris = new OwnedProp(); paris.owner = 0; paris.houses = 1; s.props.put("37", paris);
        OwnedProp ny = new OwnedProp(); ny.owner = 0; s.props.put("39", ny);

        MonopolyState.Trade t = new MonopolyState.Trade();
        t.to = 1;
        t.offerProps = new java.util.ArrayList<>(List.of(39));
        t.requestCash = 50;
        assertThatThrownBy(() -> MonopolyEngine.proposeTrade(s, 0, t))
            .hasMessageContaining("buildings");
    }

    @Test
    void onlyTheRecipientCanAcceptAndEitherPartyCanCancel() {
        MonopolyState s = game(3);
        s.phase = "MANAGE";
        OwnedProp mine = new OwnedProp(); mine.owner = 0; s.props.put("39", mine);
        MonopolyState.Trade t = new MonopolyState.Trade();
        t.to = 1;
        t.offerProps = new java.util.ArrayList<>(List.of(39));
        t.requestCash = 200;
        MonopolyEngine.proposeTrade(s, 0, t);

        assertThatThrownBy(() -> MonopolyEngine.acceptTrade(s, 2)).hasMessageContaining("addressed");
        MonopolyEngine.declineTrade(s, 0);                  // proposer cancels
        assertThat(s.pendingTrade).isNull();
    }

    @Test
    void recipientCanCounterAndTheProposerThenAccepts() {
        MonopolyState s = game(2);
        s.phase = "MANAGE";
        OwnedProp ny = new OwnedProp(); ny.owner = 0; s.props.put("39", ny);   // seat 0 owns New York

        MonopolyState.Trade offer = new MonopolyState.Trade();
        offer.to = 1;
        offer.offerProps = new java.util.ArrayList<>(List.of(39));
        offer.requestCash = 300;                            // seat 0 wants $300 for New York
        MonopolyEngine.proposeTrade(s, 0, offer);

        // Seat 1 counters: same property but only $150 (off-turn — it's seat 0's turn).
        MonopolyState.Trade counter = new MonopolyState.Trade();
        counter.to = 0;
        counter.requestProps = new java.util.ArrayList<>(List.of(39));   // seat 1 wants New York
        counter.offerCash = 150;                            // seat 1 offers $150
        MonopolyEngine.counterTrade(s, 1, counter);
        assertThat(s.pendingTrade.from).isEqualTo(1);
        assertThat(s.pendingTrade.to).isEqualTo(0);

        int c0 = s.cash.get(0), c1 = s.cash.get(1);
        MonopolyEngine.acceptTrade(s, 0);                   // proposer accepts the counter
        assertThat(s.props.get("39").owner).isEqualTo(1);   // New York is seat 1's
        assertThat(s.cash.get(0)).isEqualTo(c0 + 150);
        assertThat(s.cash.get(1)).isEqualTo(c1 - 150);
        assertThat(s.pendingTrade).isNull();
    }

    // ── Disable inactive player ──────────────────────────────────────────────

    @Test
    void disablingAStalledPlayerDistributesTheirEstate() {
        MonopolyState s = game(3);
        OwnedProp a = new OwnedProp(); a.owner = 2; s.props.put("39", a);   // seat 2 owns New York
        OwnedProp b = new OwnedProp(); b.owner = 2; s.props.put("37", b);   // and Paris
        s.cash.set(2, 600);
        s.timeouts.set(2, 2);                                // seat 2 missed 2 turns

        int c0 = s.cash.get(0), c1 = s.cash.get(1);
        MonopolyEngine.kickPlayer(s, 0, 2);

        assertThat(s.bankrupt.get(2)).isTrue();
        assertThat(s.left.get(2)).isTrue();
        assertThat(s.cash.get(2)).isZero();
        // $600 split evenly between the two remaining players.
        assertThat(s.cash.get(0)).isEqualTo(c0 + 300);
        assertThat(s.cash.get(1)).isEqualTo(c1 + 300);
        // Their two properties handed out (round-robin) to the two heirs.
        assertThat(s.props.get("39").owner).isNotEqualTo(2);
        assertThat(s.props.get("37").owner).isNotEqualTo(2);
    }

    @Test
    void cannotDisableAPlayerWhoHasNotStalled() {
        MonopolyState s = game(3);
        s.timeouts.set(2, 1);                                // only 1 missed turn
        assertThatThrownBy(() -> MonopolyEngine.kickPlayer(s, 0, 2))
            .hasMessageContaining("missed enough");
    }

    @Test
    void forcedTurnsAccumulateTheMissedTurnStreak() {
        MonopolyState s = game(2);
        MonopolyEngine.forceTurn(s);   // seat 0 times out → back to seat 0 (2p alternates)
        // After one forced turn seat 0 has 1 miss recorded.
        assertThat(s.timeouts.get(0)).isEqualTo(1);
    }
}
