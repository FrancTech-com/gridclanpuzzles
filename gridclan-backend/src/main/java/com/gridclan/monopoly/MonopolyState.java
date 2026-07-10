package com.gridclan.monopoly;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Full JSON-serialisable state of one Monopoly table (Jackson maps the public
 * fields). All lists are indexed by seat (0-based, matching {@link #players}).
 */
public class MonopolyState {

    /** Seat order — player UUIDs as strings. */
    public List<String> players = new ArrayList<>();

    /** Display name per seat — hydrated by the service so the event log reads
     *  "Sami offers Francsha1 a deal" instead of "P1 offers P2". */
    public List<String> names = new ArrayList<>();

    public List<Integer> pos        = new ArrayList<>();
    public List<Integer> cash       = new ArrayList<>();
    public List<Boolean> bankrupt   = new ArrayList<>();
    public List<Boolean> inJail     = new ArrayList<>();
    public List<Integer> jailTurns  = new ArrayList<>();
    public List<Integer> jailCards  = new ArrayList<>();   // Get Out of Jail Free held
    /** Consecutive missed (timed-out) turns per seat; reset when the player acts. */
    public List<Integer> timeouts   = new ArrayList<>();
    /** True for a seat removed by a disable/kick (vs a normal bankruptcy). */
    public List<Boolean> left       = new ArrayList<>();
    /** Seats in the order they went bankrupt (first = earliest out). */
    public List<Integer> bankruptOrder = new ArrayList<>();

    /** Ownership by square index (as string key for JSON). */
    public Map<String, OwnedProp> props = new LinkedHashMap<>();

    public int current = 0;                  // whose turn (seat)
    /** ROLL (must roll) | BUY (decide on pendingSquare) | AUCTION | MANAGE (build/trade, then end turn). */
    public String phase = "ROLL";
    public boolean extraRoll = false;        // rolled doubles — must roll again before ending
    public int doublesCount = 0;
    public int[] lastRoll = new int[]{0, 0};
    public int pendingSquare = -1;

    // ── Auction (a declined / unaffordable property goes under the hammer) ──
    public int auctionSquare = -1;           // property being auctioned (-1 = none)
    public List<Boolean> auctionIn = new ArrayList<>();   // still bidding, per seat
    public int auctionHighBid = 0;
    public int auctionHighBidder = -1;       // seat, -1 = no bid yet
    public int auctionTurn = -1;             // seat to bid next

    // ── Trade (one pending offer at a time) ──
    public Trade pendingTrade = null;

    public static class Trade {
        public int from;                     // proposer (seat)
        public int to;                       // recipient (seat)
        public int offerCash = 0;            // cash from → to
        public int requestCash = 0;          // cash to → from
        public List<Integer> offerProps = new ArrayList<>();     // squares from gives
        public List<Integer> requestProps = new ArrayList<>();   // squares from wants
        public int offerJailCards = 0;
        public int requestJailCards = 0;
    }

    public List<Integer> chanceDeck = new ArrayList<>();
    public int chanceIdx = 0;
    public List<Integer> chestDeck = new ArrayList<>();
    public int chestIdx = 0;

    public int round = 1;
    public boolean over = false;

    /** Recent human-readable events, oldest first (capped). */
    public List<String> log = new ArrayList<>();

    public static class OwnedProp {
        public int owner;            // seat
        public int houses;           // 0-4 houses, 5 = hotel
        public boolean mortgaged;
    }
}
