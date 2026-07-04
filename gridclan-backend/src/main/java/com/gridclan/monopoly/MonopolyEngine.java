package com.gridclan.monopoly;

import com.gridclan.monopoly.MonopolyBoard.Square;
import com.gridclan.monopoly.MonopolyState.OwnedProp;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Server-authoritative standard Monopoly rules for 2-8 players.
 *
 * Implemented: dice + doubles (3 → jail), GO salary, buying, rent (streets
 * with group doubling and houses/hotels, railroads, utilities), even building,
 * selling houses, mortgages, income/luxury tax, the classic Chance and
 * Community Chest decks (incl. Get Out of Jail Free), jail (pay / card /
 * roll doubles, forced fine on the 3rd try), automatic debt liquidation and
 * bankruptcy. Not in this version: player-to-player trading and auctions.
 *
 * Games are bounded for tournaments: after {@link #MAX_ROUNDS} rounds the
 * richest player (net worth) wins.
 */
public final class MonopolyEngine {

    public static final int START_CASH = 1500;
    public static final int MAX_ROUNDS = 50;
    private static final int LOG_MAX   = 120;

    private MonopolyEngine() {}

    // ── Setup ────────────────────────────────────────────────────────────────

    public static MonopolyState init(List<String> playerIds, long seed) {
        if (playerIds.size() < 2 || playerIds.size() > 8)
            throw new IllegalArgumentException("Monopoly seats 2 to 8 players.");
        MonopolyState s = new MonopolyState();
        s.players = new ArrayList<>(playerIds);
        for (int i = 0; i < playerIds.size(); i++) {
            s.pos.add(0); s.cash.add(START_CASH); s.bankrupt.add(false);
            s.inJail.add(false); s.jailTurns.add(0); s.jailCards.add(0);
        }
        Random rnd = new Random(seed);
        for (int i = 0; i < 16; i++) { s.chanceDeck.add(i); s.chestDeck.add(i); }
        Collections.shuffle(s.chanceDeck, rnd);
        Collections.shuffle(s.chestDeck, rnd);
        log(s, "The game begins — everyone starts with $" + START_CASH + ".");
        return s;
    }

    // ── Actions (all called for the current, validated seat) ────────────────

    public static void roll(MonopolyState s, int seat) {
        rollWith(s, seat, die(), die());
    }

    /** Deterministic roll — for tests only. */
    public static void rollForTest(MonopolyState s, int seat, int d1, int d2) {
        rollWith(s, seat, d1, d2);
    }

    private static void rollWith(MonopolyState s, int seat, int d1, int d2) {
        requireTurn(s, seat);
        if (!s.phase.equals("ROLL") && !(s.phase.equals("MANAGE") && s.extraRoll))
            throw new IllegalStateException("You can't roll now.");
        s.lastRoll = new int[]{d1, d2};
        boolean doubles = d1 == d2;
        s.extraRoll = false;

        if (s.inJail.get(seat)) {
            if (doubles) {
                s.inJail.set(seat, false);
                s.jailTurns.set(seat, 0);
                log(s, name(s, seat) + " rolls doubles and leaves jail!");
                advance(s, seat, d1 + d2);
                s.phase = "MANAGE";           // no extra roll for jail doubles
            } else {
                s.jailTurns.set(seat, s.jailTurns.get(seat) + 1);
                if (s.jailTurns.get(seat) >= 3) {
                    log(s, name(s, seat) + " pays the $" + MonopolyBoard.JAIL_FINE + " fine after 3 tries.");
                    pay(s, seat, -1, MonopolyBoard.JAIL_FINE);
                    if (s.bankrupt.get(seat)) { endTurnInternal(s); return; }
                    s.inJail.set(seat, false);
                    s.jailTurns.set(seat, 0);
                    advance(s, seat, d1 + d2);
                    s.phase = "MANAGE";
                } else {
                    log(s, name(s, seat) + " fails to roll doubles and stays in jail.");
                    s.phase = "MANAGE";
                }
            }
            afterAction(s);
            return;
        }

        if (doubles) {
            s.doublesCount++;
            if (s.doublesCount >= 3) {
                log(s, name(s, seat) + " rolls three doubles in a row — go to jail!");
                sendToJail(s, seat);
                s.phase = "MANAGE";
                afterAction(s);
                return;
            }
        }
        advance(s, seat, d1 + d2);
        if (!s.over && !s.bankrupt.get(seat) && !s.inJail.get(seat) && doubles) {
            s.extraRoll = true;                       // resolve BUY/MANAGE, then roll again
            log(s, name(s, seat) + " rolled doubles and gets another roll.");
        }
        if (s.phase.equals("ROLL")) s.phase = "MANAGE";
        afterAction(s);
    }

    public static void payJailFine(MonopolyState s, int seat) {
        requireTurn(s, seat);
        if (!s.inJail.get(seat) || !s.phase.equals("ROLL"))
            throw new IllegalStateException("You're not in jail (or already rolled).");
        pay(s, seat, -1, MonopolyBoard.JAIL_FINE);
        if (!s.bankrupt.get(seat)) {
            s.inJail.set(seat, false);
            s.jailTurns.set(seat, 0);
            log(s, name(s, seat) + " pays $" + MonopolyBoard.JAIL_FINE + " to leave jail.");
        }
        afterAction(s);
    }

    public static void useJailCard(MonopolyState s, int seat) {
        requireTurn(s, seat);
        if (!s.inJail.get(seat) || !s.phase.equals("ROLL"))
            throw new IllegalStateException("You're not in jail (or already rolled).");
        if (s.jailCards.get(seat) <= 0)
            throw new IllegalStateException("You don't hold a Get Out of Jail Free card.");
        s.jailCards.set(seat, s.jailCards.get(seat) - 1);
        s.inJail.set(seat, false);
        s.jailTurns.set(seat, 0);
        log(s, name(s, seat) + " uses a Get Out of Jail Free card.");
        afterAction(s);
    }

    public static void buy(MonopolyState s, int seat) {
        requireTurn(s, seat);
        if (!s.phase.equals("BUY") || s.pendingSquare < 0)
            throw new IllegalStateException("Nothing to buy right now.");
        Square sq = MonopolyBoard.at(s.pendingSquare);
        if (s.cash.get(seat) < sq.price())
            throw new IllegalStateException("Not enough cash.");
        s.cash.set(seat, s.cash.get(seat) - sq.price());
        OwnedProp p = new OwnedProp();
        p.owner = seat;
        s.props.put(String.valueOf(s.pendingSquare), p);
        log(s, name(s, seat) + " buys " + sq.name() + " for $" + sq.price() + ".");
        s.pendingSquare = -1;
        s.phase = "MANAGE";
        afterAction(s);
    }

    public static void skipBuy(MonopolyState s, int seat) {
        requireTurn(s, seat);
        if (!s.phase.equals("BUY"))
            throw new IllegalStateException("Nothing to decide right now.");
        log(s, name(s, seat) + " passes on " + MonopolyBoard.at(s.pendingSquare).name() + ".");
        s.pendingSquare = -1;
        s.phase = "MANAGE";
        afterAction(s);
    }

    public static void build(MonopolyState s, int seat, int squareIdx) {
        requireTurn(s, seat);
        requireManage(s);
        Square sq = square(squareIdx, "PROP");
        OwnedProp p = owned(s, squareIdx, seat);
        if (p.mortgaged) throw new IllegalStateException("Unmortgage it first.");
        if (p.houses >= 5) throw new IllegalStateException("Already has a hotel.");
        if (!ownsFullGroup(s, seat, sq.group()))
            throw new IllegalStateException("You need the whole colour group to build.");
        // Even-build: no street in the group may trail by more than one house.
        for (Square other : MonopolyBoard.group(sq.group())) {
            OwnedProp op = s.props.get(String.valueOf(other.index()));
            if (op == null || op.mortgaged || (other.index() != squareIdx && op.houses < p.houses))
                throw new IllegalStateException("Build evenly across the colour group.");
        }
        if (s.cash.get(seat) < sq.houseCost())
            throw new IllegalStateException("Not enough cash.");
        s.cash.set(seat, s.cash.get(seat) - sq.houseCost());
        p.houses++;
        log(s, name(s, seat) + " builds " + (p.houses == 5 ? "a hotel" : "house " + p.houses)
            + " on " + sq.name() + ".");
    }

    public static void sellHouse(MonopolyState s, int seat, int squareIdx) {
        requireTurn(s, seat);
        requireManage(s);
        Square sq = square(squareIdx, "PROP");
        OwnedProp p = owned(s, squareIdx, seat);
        if (p.houses <= 0) throw new IllegalStateException("Nothing built there.");
        for (Square other : MonopolyBoard.group(sq.group())) {
            OwnedProp op = s.props.get(String.valueOf(other.index()));
            if (op != null && other.index() != squareIdx && op.houses > p.houses)
                throw new IllegalStateException("Sell evenly across the colour group.");
        }
        p.houses--;
        s.cash.set(seat, s.cash.get(seat) + sq.houseCost() / 2);
        log(s, name(s, seat) + " sells a house on " + sq.name() + ".");
    }

    public static void mortgage(MonopolyState s, int seat, int squareIdx) {
        requireTurn(s, seat);
        requireManage(s);
        Square sq = MonopolyBoard.at(squareIdx);
        if (!sq.ownable()) throw new IllegalArgumentException("Not a property.");
        OwnedProp p = owned(s, squareIdx, seat);
        if (p.mortgaged) throw new IllegalStateException("Already mortgaged.");
        if (p.houses > 0) throw new IllegalStateException("Sell the houses first.");
        p.mortgaged = true;
        s.cash.set(seat, s.cash.get(seat) + sq.price() / 2);
        log(s, name(s, seat) + " mortgages " + sq.name() + " for $" + sq.price() / 2 + ".");
    }

    public static void unmortgage(MonopolyState s, int seat, int squareIdx) {
        requireTurn(s, seat);
        requireManage(s);
        Square sq = MonopolyBoard.at(squareIdx);
        OwnedProp p = owned(s, squareIdx, seat);
        if (!p.mortgaged) throw new IllegalStateException("Not mortgaged.");
        int cost = sq.price() / 2 + sq.price() / 20;   // principal + 10% interest
        if (s.cash.get(seat) < cost) throw new IllegalStateException("Not enough cash.");
        s.cash.set(seat, s.cash.get(seat) - cost);
        p.mortgaged = false;
        log(s, name(s, seat) + " lifts the mortgage on " + sq.name() + ".");
    }

    public static void endTurn(MonopolyState s, int seat) {
        requireTurn(s, seat);
        if (s.phase.equals("BUY")) skipBuy(s, seat);
        if (s.extraRoll)
            throw new IllegalStateException("You rolled doubles — roll again first.");
        if (s.phase.equals("ROLL"))
            throw new IllegalStateException("Roll the dice first.");
        endTurnInternal(s);
    }

    /**
     * Force the current player's turn to completion (turn clock lapsed):
     * roll if needed, decline any purchase, and end the turn.
     */
    public static void forceTurn(MonopolyState s) {
        int seat = s.current;
        int guard = 0;
        while (!s.over && s.current == seat && guard++ < 8) {
            switch (s.phase) {
                case "ROLL" -> roll(s, seat);
                case "BUY"  -> skipBuy(s, seat);
                default -> {
                    if (s.extraRoll) roll(s, seat);
                    else endTurnInternal(s);
                }
            }
        }
        log(s, name(s, seat) + " ran out of time — turn passed.");
    }

    // ── Movement + squares ───────────────────────────────────────────────────

    private static void advance(MonopolyState s, int seat, int steps) {
        int from = s.pos.get(seat);
        int to = (from + steps) % MonopolyBoard.SIZE;
        if (to < from) collectSalary(s, seat);
        s.pos.set(seat, to);
        resolveSquare(s, seat, 1);
    }

    private static void moveTo(MonopolyState s, int seat, int square, boolean salary) {
        if (salary && square < s.pos.get(seat)) collectSalary(s, seat);
        s.pos.set(seat, square);
        resolveSquare(s, seat, 1);
    }

    private static void collectSalary(MonopolyState s, int seat) {
        s.cash.set(seat, s.cash.get(seat) + MonopolyBoard.GO_SALARY);
        log(s, name(s, seat) + " passes GO and collects $" + MonopolyBoard.GO_SALARY + ".");
    }

    private static void resolveSquare(MonopolyState s, int seat, int utilityFactor) {
        Square sq = MonopolyBoard.at(s.pos.get(seat));
        log(s, name(s, seat) + " lands on " + sq.name() + ".");
        switch (sq.type()) {
            case "PROP", "RAIL", "UTIL" -> {
                OwnedProp p = s.props.get(String.valueOf(sq.index()));
                if (p == null) {
                    if (s.cash.get(seat) >= sq.price()) {
                        s.phase = "BUY";
                        s.pendingSquare = sq.index();
                    }
                } else if (p.owner != seat && !p.mortgaged && !s.bankrupt.get(p.owner)) {
                    int rent;
                    if (sq.type().equals("UTIL") && utilityFactor > 1) {
                        // "Nearest utility" Chance card: pay 10× the dice, flat.
                        rent = (s.lastRoll[0] + s.lastRoll[1]) * utilityFactor;
                    } else {
                        rent = rentOf(s, sq, p);
                        if (sq.type().equals("RAIL") && utilityFactor > 1) rent *= utilityFactor;
                    }
                    log(s, name(s, seat) + " owes " + name(s, p.owner) + " $" + rent + " rent.");
                    pay(s, seat, p.owner, rent);
                }
            }
            case "TAX" -> {
                log(s, name(s, seat) + " pays $" + sq.price() + " " + sq.name() + ".");
                pay(s, seat, -1, sq.price());
            }
            case "CHANCE" -> drawChance(s, seat);
            case "CHEST"  -> drawChest(s, seat);
            case "GO_TO_JAIL" -> sendToJail(s, seat);
            default -> { }
        }
    }

    /** Standard rent: streets double with a full group, houses/hotel table;
     *  railroads by count owned; utilities 4×/10× the dice. */
    private static int rentOf(MonopolyState s, Square sq, OwnedProp p) {
        switch (sq.type()) {
            case "PROP" -> {
                if (p.houses > 0) return sq.rent()[p.houses];
                int base = sq.rent()[0];
                return ownsFullGroup(s, p.owner, sq.group()) ? base * 2 : base;
            }
            case "RAIL" -> {
                int owned = 0;
                for (Square r : MonopolyBoard.group("RAIL")) {
                    OwnedProp rp = s.props.get(String.valueOf(r.index()));
                    if (rp != null && rp.owner == p.owner && !rp.mortgaged) owned++;
                }
                return sq.rent()[Math.max(0, owned - 1)];
            }
            case "UTIL" -> {
                int owned = 0;
                for (Square u : MonopolyBoard.group("UTIL")) {
                    OwnedProp up = s.props.get(String.valueOf(u.index()));
                    if (up != null && up.owner == p.owner && !up.mortgaged) owned++;
                }
                int dice = s.lastRoll[0] + s.lastRoll[1];
                return dice * (owned >= 2 ? 10 : 4);
            }
            default -> { }
        }
        return 0;
    }

    private static boolean ownsFullGroup(MonopolyState s, int seat, String group) {
        for (Square sq : MonopolyBoard.group(group)) {
            OwnedProp p = s.props.get(String.valueOf(sq.index()));
            if (p == null || p.owner != seat) return false;
        }
        return true;
    }

    private static void sendToJail(MonopolyState s, int seat) {
        s.pos.set(seat, MonopolyBoard.JAIL_SQUARE);
        s.inJail.set(seat, true);
        s.jailTurns.set(seat, 0);
        s.doublesCount = 0;
        s.extraRoll = false;
        log(s, name(s, seat) + " goes to jail.");
    }

    // ── Cards ────────────────────────────────────────────────────────────────

    private static void drawChance(MonopolyState s, int seat) {
        int card = s.chanceDeck.get(s.chanceIdx);
        s.chanceIdx = (s.chanceIdx + 1) % 16;
        switch (card) {
            case 0  -> { log(s, chance("Advance to GO — collect $200.")); moveToGo(s, seat); }
            case 1  -> { log(s, chance("Advance to Illinois Avenue.")); moveTo(s, seat, 24, true); }
            case 2  -> { log(s, chance("Advance to St. Charles Place.")); moveTo(s, seat, 11, true); }
            case 3  -> { log(s, chance("Advance to the nearest Utility — pay 10× the dice."));
                         moveNearest(s, seat, "UTIL", 10); }
            case 4, 5 -> { log(s, chance("Advance to the nearest Railroad — pay double rent."));
                         moveNearest(s, seat, "RAIL", 2); }
            case 6  -> { log(s, chance("Bank pays you a dividend of $50.")); credit(s, seat, 50); }
            case 7  -> { log(s, chance("Get Out of Jail Free — keep this card."));
                         s.jailCards.set(seat, s.jailCards.get(seat) + 1); }
            case 8  -> { log(s, chance("Go back 3 spaces."));
                         s.pos.set(seat, (s.pos.get(seat) + 37) % 40); resolveSquare(s, seat, 1); }
            case 9  -> { log(s, chance("Go directly to Jail.")); sendToJail(s, seat); }
            case 10 -> { log(s, chance("General repairs: $25 per house, $100 per hotel."));
                         repairs(s, seat, 25, 100); }
            case 11 -> { log(s, chance("Speeding fine — pay $15.")); pay(s, seat, -1, 15); }
            case 12 -> { log(s, chance("Take a trip to Reading Railroad.")); moveTo(s, seat, 5, true); }
            case 13 -> { log(s, chance("Take a walk on the Boardwalk.")); moveTo(s, seat, 39, false); }
            case 14 -> { log(s, chance("Chairman of the Board — pay each player $50."));
                         payEach(s, seat, 50); }
            case 15 -> { log(s, chance("Your building loan matures — collect $150.")); credit(s, seat, 150); }
            default -> { }
        }
    }

    private static void drawChest(MonopolyState s, int seat) {
        int card = s.chestDeck.get(s.chestIdx);
        s.chestIdx = (s.chestIdx + 1) % 16;
        switch (card) {
            case 0  -> { log(s, chest("Advance to GO — collect $200.")); moveToGo(s, seat); }
            case 1  -> { log(s, chest("Bank error in your favour — collect $200.")); credit(s, seat, 200); }
            case 2  -> { log(s, chest("Doctor's fee — pay $50.")); pay(s, seat, -1, 50); }
            case 3  -> { log(s, chest("From sale of stock you get $50.")); credit(s, seat, 50); }
            case 4  -> { log(s, chest("Get Out of Jail Free — keep this card."));
                         s.jailCards.set(seat, s.jailCards.get(seat) + 1); }
            case 5  -> { log(s, chest("Go directly to Jail.")); sendToJail(s, seat); }
            case 6  -> { log(s, chest("Holiday fund matures — collect $100.")); credit(s, seat, 100); }
            case 7  -> { log(s, chest("Income tax refund — collect $20.")); credit(s, seat, 20); }
            case 8  -> { log(s, chest("It's your birthday — collect $10 from every player."));
                         collectEach(s, seat, 10); }
            case 9  -> { log(s, chest("Life insurance matures — collect $100.")); credit(s, seat, 100); }
            case 10 -> { log(s, chest("Hospital fees — pay $100.")); pay(s, seat, -1, 100); }
            case 11 -> { log(s, chest("School fees — pay $50.")); pay(s, seat, -1, 50); }
            case 12 -> { log(s, chest("Receive a $25 consultancy fee.")); credit(s, seat, 25); }
            case 13 -> { log(s, chest("Street repairs: $40 per house, $115 per hotel."));
                         repairs(s, seat, 40, 115); }
            case 14 -> { log(s, chest("You won second prize in a beauty contest — collect $10.")); credit(s, seat, 10); }
            case 15 -> { log(s, chest("You inherit $100.")); credit(s, seat, 100); }
            default -> { }
        }
    }

    private static String chance(String text) { return "🎲 Chance: " + text; }
    private static String chest(String text)  { return "📦 Community Chest: " + text; }

    private static void moveToGo(MonopolyState s, int seat) {
        collectSalary(s, seat);
        s.pos.set(seat, 0);
    }

    private static void moveNearest(MonopolyState s, int seat, String type, int factor) {
        int p = s.pos.get(seat);
        for (int i = 1; i <= 40; i++) {
            int idx = (p + i) % 40;
            if (MonopolyBoard.at(idx).type().equals(type)) {
                if (idx < p) collectSalary(s, seat);
                s.pos.set(seat, idx);
                resolveSquare(s, seat, factor);
                return;
            }
        }
    }

    private static void repairs(MonopolyState s, int seat, int perHouse, int perHotel) {
        int total = 0;
        for (Map.Entry<String, OwnedProp> e : s.props.entrySet()) {
            OwnedProp p = e.getValue();
            if (p.owner != seat) continue;
            total += p.houses == 5 ? perHotel : p.houses * perHouse;
        }
        if (total > 0) pay(s, seat, -1, total);
    }

    private static void payEach(MonopolyState s, int seat, int amount) {
        for (int other = 0; other < s.players.size(); other++) {
            if (other == seat || s.bankrupt.get(other) || s.bankrupt.get(seat)) continue;
            pay(s, seat, other, amount);
        }
    }

    private static void collectEach(MonopolyState s, int seat, int amount) {
        for (int other = 0; other < s.players.size(); other++) {
            if (other == seat || s.bankrupt.get(other)) continue;
            pay(s, other, seat, amount);
        }
    }

    private static void credit(MonopolyState s, int seat, int amount) {
        s.cash.set(seat, s.cash.get(seat) + amount);
    }

    // ── Money, debt and bankruptcy ───────────────────────────────────────────

    /** Pay {@code amount} from a seat to another seat (or the bank when to = -1),
     *  auto-liquidating (sell houses, mortgage) and going bankrupt if short. */
    private static void pay(MonopolyState s, int from, int to, int amount) {
        liquidate(s, from, amount);
        int available = Math.min(amount, s.cash.get(from));
        s.cash.set(from, s.cash.get(from) - available);
        if (to >= 0) s.cash.set(to, s.cash.get(to) + available);
        if (available < amount) goBankrupt(s, from, to);
    }

    /** Raise cash automatically: sell houses first, then mortgage properties. */
    private static void liquidate(MonopolyState s, int seat, int needed) {
        if (s.cash.get(seat) >= needed) return;
        boolean sold = true;
        while (s.cash.get(seat) < needed && sold) {
            sold = false;
            for (Map.Entry<String, OwnedProp> e : s.props.entrySet()) {
                OwnedProp p = e.getValue();
                Square sq = MonopolyBoard.at(Integer.parseInt(e.getKey()));
                if (p.owner == seat && p.houses > 0) {
                    p.houses--;
                    s.cash.set(seat, s.cash.get(seat) + sq.houseCost() / 2);
                    sold = true;
                    if (s.cash.get(seat) >= needed) return;
                }
            }
        }
        for (Map.Entry<String, OwnedProp> e : s.props.entrySet()) {
            if (s.cash.get(seat) >= needed) return;
            OwnedProp p = e.getValue();
            Square sq = MonopolyBoard.at(Integer.parseInt(e.getKey()));
            if (p.owner == seat && !p.mortgaged && p.houses == 0) {
                p.mortgaged = true;
                s.cash.set(seat, s.cash.get(seat) + sq.price() / 2);
            }
        }
    }

    /** Everything goes to the creditor (or back to the bank); the seat is out. */
    private static void goBankrupt(MonopolyState s, int seat, int creditor) {
        if (s.bankrupt.get(seat)) return;
        s.bankrupt.set(seat, true);
        s.bankruptOrder.add(seat);
        s.inJail.set(seat, false);
        log(s, name(s, seat) + " is bankrupt!");
        List<String> keys = new ArrayList<>(s.props.keySet());
        for (String key : keys) {
            OwnedProp p = s.props.get(key);
            if (p.owner != seat) continue;
            if (creditor >= 0 && !s.bankrupt.get(creditor)) {
                p.owner = creditor;
                p.houses = 0;                     // houses go back to the bank
            } else {
                s.props.remove(key);              // back to the bank, unowned
            }
        }
        if (creditor >= 0 && !s.bankrupt.get(creditor)) {
            s.cash.set(creditor, s.cash.get(creditor) + Math.max(0, s.cash.get(seat)));
            s.jailCards.set(creditor, s.jailCards.get(creditor) + s.jailCards.get(seat));
        }
        s.cash.set(seat, 0);
        s.jailCards.set(seat, 0);
        checkGameOver(s);
    }

    // ── Turn / game end ──────────────────────────────────────────────────────

    private static void endTurnInternal(MonopolyState s) {
        s.doublesCount = 0;
        s.extraRoll = false;
        s.pendingSquare = -1;
        if (s.over) return;
        int prev = s.current;
        for (int i = 1; i <= s.players.size(); i++) {
            int next = (prev + i) % s.players.size();
            if (!s.bankrupt.get(next)) {
                if (next <= prev) {
                    s.round++;
                    if (s.round > MAX_ROUNDS) {
                        log(s, "Round limit reached — richest player wins!");
                        s.over = true;
                        return;
                    }
                }
                s.current = next;
                s.phase = "ROLL";
                return;
            }
        }
        s.over = true;   // nobody left to move
    }

    private static void afterAction(MonopolyState s) {
        checkGameOver(s);
        // A bankrupt current player can't act — hand the turn on.
        if (!s.over && s.bankrupt.get(s.current)) endTurnInternal(s);
    }

    private static void checkGameOver(MonopolyState s) {
        int alive = 0;
        for (boolean b : s.bankrupt) if (!b) alive++;
        if (alive <= 1) {
            s.over = true;
            log(s, "Game over!");
        }
    }

    /** Cash + unmortgaged property value + half value of mortgaged + houses. */
    public static int netWorth(MonopolyState s, int seat) {
        if (s.bankrupt.get(seat)) return 0;
        int worth = s.cash.get(seat);
        for (Map.Entry<String, OwnedProp> e : s.props.entrySet()) {
            OwnedProp p = e.getValue();
            if (p.owner != seat) continue;
            Square sq = MonopolyBoard.at(Integer.parseInt(e.getKey()));
            worth += p.mortgaged ? sq.price() / 2 : sq.price();
            worth += p.houses * sq.houseCost() / 2;
        }
        return worth;
    }

    /** Final standings: alive seats by net worth, then bankrupts (latest out first). */
    public static List<Integer> ranking(MonopolyState s) {
        List<Integer> alive = new ArrayList<>();
        for (int i = 0; i < s.players.size(); i++) if (!s.bankrupt.get(i)) alive.add(i);
        alive.sort(Comparator.comparingInt((Integer i) -> -netWorth(s, i)).thenComparing(i -> i));
        List<Integer> out = new ArrayList<>(alive);
        List<Integer> gone = new ArrayList<>(s.bankruptOrder);
        Collections.reverse(gone);
        out.addAll(gone);
        return out;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static int die() { return ThreadLocalRandom.current().nextInt(1, 7); }

    private static void requireTurn(MonopolyState s, int seat) {
        if (s.over) throw new IllegalStateException("The game is over.");
        if (s.current != seat) throw new IllegalStateException("It's not your turn.");
        if (s.bankrupt.get(seat)) throw new IllegalStateException("You're bankrupt.");
    }

    private static void requireManage(MonopolyState s) {
        if (s.phase.equals("BUY"))
            throw new IllegalStateException("Decide on the purchase first.");
    }

    private static Square square(int idx, String type) {
        if (idx < 0 || idx >= MonopolyBoard.SIZE)
            throw new IllegalArgumentException("Bad square.");
        Square sq = MonopolyBoard.at(idx);
        if (!sq.type().equals(type))
            throw new IllegalArgumentException("You can only build on streets.");
        return sq;
    }

    private static OwnedProp owned(MonopolyState s, int idx, int seat) {
        OwnedProp p = s.props.get(String.valueOf(idx));
        if (p == null || p.owner != seat)
            throw new IllegalStateException("You don't own that.");
        return p;
    }

    private static String name(MonopolyState s, int seat) {
        return "P" + (seat + 1);   // the service substitutes display names in views
    }

    private static void log(MonopolyState s, String line) {
        s.log.add(line);
        if (s.log.size() > LOG_MAX) s.log.subList(0, s.log.size() - LOG_MAX).clear();
    }
}
