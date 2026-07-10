package com.gridclan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.entity.MonopolyGame;
import com.gridclan.monopoly.MonopolyBoard;
import com.gridclan.monopoly.MonopolyEngine;
import com.gridclan.monopoly.MonopolyState;
import com.gridclan.repository.MonopolyGameRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

/**
 * Monopoly — tournament-only tables of 2-8 players (marketed for 6-8).
 * Server-authoritative: all rules run in {@link MonopolyEngine}; clients only
 * send actions (ROLL, BUY, SKIP_BUY, BUILD, SELL_HOUSE, MORTGAGE, UNMORTGAGE,
 * PAY_JAIL, USE_JAIL_CARD, END_TURN).
 *
 * Turn clock: 5 minutes — a lapsed turn is auto-played (roll, decline any
 * purchase, end turn) so a table never stalls on one player.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MonopolyGameService {

    /** Turn clock: 5 minutes per turn, then the turn is auto-played. */
    public static final long TURN_SECONDS = 300;
    static final int WIN_POINTS = 300;

    private static final ObjectMapper JSON   = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final MonopolyGameRepository repo;
    private final SimpMessagingTemplate  messaging;
    private final PlayerPointsService    pointsService;
    private final GemService             gemService;
    private final RankService            rankService;
    private final UserRepository         userRepo;

    // ── Tournament match support ─────────────────────────────────────────────

    /** Create a pre-seated ACTIVE table for tournament players (2-8 seats). */
    @Transactional
    public UUID createTableMatch(List<UUID> players) {
        List<String> ids = players.stream().map(UUID::toString).toList();
        MonopolyState state = MonopolyEngine.init(ids, RANDOM.nextLong());
        hydrateNames(state);   // so the event log reads player names, not "P1"
        MonopolyGame g = MonopolyGame.builder()
            .status("ACTIVE")
            .playersCsv(String.join(",", ids))
            .state(write(state))
            .build();
        repo.save(g);
        log.info("Monopoly table created: game={} seats={}", g.getId(), players.size());
        return g.getId();
    }

    @Transactional(readOnly = true)
    public boolean isMatchComplete(UUID gameId) {
        return repo.findById(gameId).map(g -> "COMPLETE".equals(g.getStatus())).orElse(false);
    }

    @Transactional(readOnly = true)
    public UUID matchWinner(UUID gameId) {
        List<UUID> ranking = matchRanking(gameId);
        return ranking.isEmpty() ? null : ranking.get(0);
    }

    /** Final standings (alive by net worth, then bankrupts latest-out first). */
    @Transactional(readOnly = true)
    public List<UUID> matchRanking(UUID gameId) {
        MonopolyGame g = repo.findById(gameId).orElse(null);
        if (g == null) return List.of();
        MonopolyState s = read(g.getState());
        List<UUID> out = new ArrayList<>();
        for (int seat : MonopolyEngine.ranking(s)) out.add(UUID.fromString(s.players.get(seat)));
        return out;
    }

    /** Player ids seated at this table (for the chat/voice relays). */
    @Transactional(readOnly = true)
    public List<UUID> participants(UUID gameId) {
        return repo.findById(gameId)
            .map(g -> Arrays.stream(g.getPlayersCsv().split(","))
                .map(UUID::fromString).toList())
            .orElse(List.of());
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> act(UUID userId, UUID gameId, String action,
                                   Integer square, Integer amount, TradePayload trade, Integer target) {
        MonopolyGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Game is not active.");
        if (g.getPausedAt() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Table is paused — resume to play.");

        MonopolyState s = read(g.getState());
        int seat = seatOf(s, userId);
        if (seat < 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not at this table.");

        try {
            switch (action == null ? "" : action.toUpperCase()) {
                case "ROLL"          -> MonopolyEngine.roll(s, seat);
                case "BUY"           -> MonopolyEngine.buy(s, seat);
                case "SKIP_BUY"      -> MonopolyEngine.skipBuy(s, seat);
                case "BUILD"         -> MonopolyEngine.build(s, seat, need(square));
                case "SELL_HOUSE"    -> MonopolyEngine.sellHouse(s, seat, need(square));
                case "MORTGAGE"      -> MonopolyEngine.mortgage(s, seat, need(square));
                case "UNMORTGAGE"    -> MonopolyEngine.unmortgage(s, seat, need(square));
                case "PAY_JAIL"      -> MonopolyEngine.payJailFine(s, seat);
                case "USE_JAIL_CARD" -> MonopolyEngine.useJailCard(s, seat);
                case "END_TURN"      -> MonopolyEngine.endTurn(s, seat);
                case "AUCTION_BID"   -> MonopolyEngine.auctionBid(s, seat, needAmount(amount));
                case "AUCTION_PASS"  -> MonopolyEngine.auctionPass(s, seat);
                case "PROPOSE_TRADE" -> MonopolyEngine.proposeTrade(s, seat, toTrade(trade));
                case "COUNTER_TRADE" -> MonopolyEngine.counterTrade(s, seat, toTrade(trade));
                case "ACCEPT_TRADE"  -> MonopolyEngine.acceptTrade(s, seat);
                case "DECLINE_TRADE" -> MonopolyEngine.declineTrade(s, seat);
                case "KICK"          -> MonopolyEngine.kickPlayer(s, seat, needTarget(target));
                default -> throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unknown action.");
            }
        } catch (IllegalStateException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        }

        g.setLastMoveAt(Instant.now());
        persist(g, s);
        return view(userId, g, s);
    }

    /** Trade payload shape shared with the controller. */
    public record TradePayload(Integer to, Integer offerCash, Integer requestCash,
                               List<Integer> offerProps, List<Integer> requestProps,
                               Integer offerJailCards, Integer requestJailCards) {}

    private static MonopolyState.Trade toTrade(TradePayload p) {
        if (p == null || p.to() == null)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Pick a player to trade with.");
        MonopolyState.Trade t = new MonopolyState.Trade();
        t.to               = p.to();
        t.offerCash        = p.offerCash() != null ? p.offerCash() : 0;
        t.requestCash      = p.requestCash() != null ? p.requestCash() : 0;
        t.offerProps       = p.offerProps() != null ? new ArrayList<>(p.offerProps()) : new ArrayList<>();
        t.requestProps     = p.requestProps() != null ? new ArrayList<>(p.requestProps()) : new ArrayList<>();
        t.offerJailCards   = p.offerJailCards() != null ? p.offerJailCards() : 0;
        t.requestJailCards = p.requestJailCards() != null ? p.requestJailCards() : 0;
        return t;
    }

    @Transactional
    public Map<String, Object> get(UUID userId, UUID gameId) {
        MonopolyGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        enforceTurnClock(g);
        return view(userId, g, read(g.getState()));
    }

    // ── Turn clock ────────────────────────────────────────────────────────────

    private Instant turnDeadline(MonopolyGame g) {
        if (!"ACTIVE".equals(g.getStatus()) || g.getPausedAt() != null) return null;
        return g.getLastMoveAt().plusSeconds(TURN_SECONDS);
    }

    // ── Pause / resume (any player at the table) ───────────────────────────────

    @Transactional
    public Map<String, Object> pause(UUID userId, UUID gameId) {
        MonopolyGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        requireSeated(g, userId);
        if (!"ACTIVE".equals(g.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a live table can be paused.");
        if (g.getPausedAt() == null) { g.setPausedAt(Instant.now()); repo.save(g); broadcast(g, read(g.getState())); }
        return view(userId, g, read(g.getState()));
    }

    @Transactional
    public Map<String, Object> resume(UUID userId, UUID gameId) {
        MonopolyGame g = repo.findById(gameId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found."));
        requireSeated(g, userId);
        if (g.getPausedAt() != null) {
            g.setPausedAt(null);
            g.setLastMoveAt(Instant.now());
            repo.save(g);
            broadcast(g, read(g.getState()));
        }
        return view(userId, g, read(g.getState()));
    }

    /** Called externally (e.g. a tournament pausing all its tables). */
    @Transactional
    public void setPaused(UUID gameId, boolean paused) {
        repo.findById(gameId).ifPresent(g -> {
            if (!"ACTIVE".equals(g.getStatus())) return;
            if (paused && g.getPausedAt() == null) g.setPausedAt(Instant.now());
            else if (!paused && g.getPausedAt() != null) { g.setPausedAt(null); g.setLastMoveAt(Instant.now()); }
            else return;
            repo.save(g);
            broadcast(g, read(g.getState()));
        });
    }

    private void requireSeated(MonopolyGame g, UUID userId) {
        boolean seated = Arrays.stream(g.getPlayersCsv().split(",")).anyMatch(x -> userId.toString().equals(x));
        if (!seated) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not at this table.");
    }

    /** Auto-play the current player's lapsed turn (roll, decline, end turn). */
    @Transactional
    public boolean enforceTurnClock(MonopolyGame g) {
        boolean changed = false;
        int guard = 0;
        Instant deadline;
        while ((deadline = turnDeadline(g)) != null && Instant.now().isAfter(deadline) && guard++ < 8) {
            MonopolyState s = read(g.getState());
            MonopolyEngine.forceTurn(s);
            g.setLastMoveAt(deadline);   // the next player's window starts where this lapsed
            persist(g, s);
            changed = true;
        }
        return changed;
    }

    /** Sweep every ACTIVE table whose turn clock has lapsed (TurnTimerJob). */
    @Transactional
    public int sweepTurnClocks() {
        int n = 0;
        for (MonopolyGame g : repo.findByStatus("ACTIVE")) {
            if (enforceTurnClock(g)) n++;
        }
        return n;
    }

    // ── Persistence + finish ─────────────────────────────────────────────────

    private void persist(MonopolyGame g, MonopolyState s) {
        if (s.over && !"COMPLETE".equals(g.getStatus())) {
            g.setStatus("COMPLETE");
            List<Integer> ranking = MonopolyEngine.ranking(s);
            if (!ranking.isEmpty()) {
                UUID winner = UUID.fromString(s.players.get(ranking.get(0)));
                g.setWinnerId(winner);
                pointsService.creditGamePoints(winner, "MONOPOLY", WIN_POINTS, "GAME_WIN", g.getId());
                gemService.creditGems(winner, rankService.gemsPerWin(winner), "GAME_REWARD", g.getId());
                log.info("Monopoly table finished: game={} winner={}", g.getId(), winner);
            }
        }
        g.setState(write(s));
        repo.save(g);
        broadcast(g, s);
    }

    private void broadcast(MonopolyGame g, MonopolyState s) {
        try {
            messaging.convertAndSend("/topic/monopoly/" + g.getId(), Map.of(
                "gameId",        g.getId().toString(),
                "status",        g.getStatus(),
                "currentPlayer", s.current,
                "version",       g.getLastMoveAt().toEpochMilli()
            ));
        } catch (Exception ignored) { /* live updates are never fatal */ }
    }

    // ── View ─────────────────────────────────────────────────────────────────

    private Map<String, Object> view(UUID userId, MonopolyGame g, MonopolyState s) {
        int me = seatOf(s, userId);

        List<Map<String, Object>> players = new ArrayList<>();
        for (int i = 0; i < s.players.size(); i++) {
            boolean timedOut = safeGet(s.timeouts, i) >= MonopolyEngine.KICK_AFTER_TIMEOUTS;
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("seat",      i);
            p.put("name",      displayName(UUID.fromString(s.players.get(i))));
            p.put("cash",      s.cash.get(i));
            p.put("pos",       s.pos.get(i));
            p.put("inJail",    s.inJail.get(i));
            p.put("jailCards", s.jailCards.get(i));
            p.put("bankrupt",  s.bankrupt.get(i));
            p.put("left",      safeBool(s.left, i));
            p.put("timeouts",  safeGet(s.timeouts, i));
            p.put("netWorth",  MonopolyEngine.netWorth(s, i));
            p.put("current",   i == s.current && "ACTIVE".equals(g.getStatus()));
            // Any active player at the table may disable someone who's stalled it.
            p.put("kickable",  timedOut && !s.bankrupt.get(i)
                                 && me >= 0 && me != i && !s.bankrupt.get(me)
                                 && "ACTIVE".equals(g.getStatus()));
            players.add(p);
        }

        List<Map<String, Object>> props = new ArrayList<>();
        for (Map.Entry<String, MonopolyState.OwnedProp> e : s.props.entrySet()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("square",    Integer.parseInt(e.getKey()));
            p.put("owner",     e.getValue().owner);
            p.put("houses",    e.getValue().houses);
            p.put("mortgaged", e.getValue().mortgaged);
            props.add(p);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gameId",        g.getId());
        out.put("status",        g.getStatus());
        out.put("yourSeat",      me);
        out.put("spectator",     me < 0);
        out.put("yourTurn",      me >= 0 && me == s.current && "ACTIVE".equals(g.getStatus()));
        out.put("current",       s.current);
        out.put("phase",         s.phase);
        out.put("extraRoll",     s.extraRoll);
        out.put("lastRoll",      List.of(s.lastRoll[0], s.lastRoll[1]));
        out.put("pendingSquare", s.pendingSquare);
        out.put("round",         s.round);
        out.put("maxRounds",     MonopolyEngine.MAX_ROUNDS);
        out.put("players",       players);
        out.put("properties",    props);
        out.put("log",           s.log.size() > 40 ? s.log.subList(s.log.size() - 40, s.log.size()) : s.log);
        out.put("auction",       "AUCTION".equals(s.phase) ? auctionView(s, me) : null);
        out.put("trade",         s.pendingTrade != null ? tradeView(s, me) : null);
        Instant deadline = turnDeadline(g);
        out.put("turnDeadline",  deadline != null ? deadline.toEpochMilli() : null);
        out.put("paused",        g.getPausedAt() != null);
        if ("COMPLETE".equals(g.getStatus())) {
            out.put("outcome", me < 0 ? "SPECTATOR"
                : g.getWinnerId() == null ? "TIE"
                : g.getWinnerId().equals(userId) ? "WON" : "LOST");
            out.put("winnerName", g.getWinnerId() != null ? displayName(g.getWinnerId()) : null);
        }
        return out;
    }

    /** Live auction state, with names resolved and a flag for the viewer. */
    private Map<String, Object> auctionView(MonopolyState s, int me) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("square",         s.auctionSquare);
        a.put("squareName",     MonopolyBoard.at(s.auctionSquare).name());
        a.put("highBid",        s.auctionHighBid);
        a.put("highBidder",     s.auctionHighBidder);
        a.put("highBidderName", s.auctionHighBidder >= 0
            ? displayName(UUID.fromString(s.players.get(s.auctionHighBidder))) : null);
        a.put("turn",           s.auctionTurn);
        a.put("turnName",       s.auctionTurn >= 0
            ? displayName(UUID.fromString(s.players.get(s.auctionTurn))) : null);
        a.put("in",             new ArrayList<>(s.auctionIn));
        a.put("yourBid",        me >= 0 && me == s.auctionTurn && me < s.auctionIn.size() && s.auctionIn.get(me));
        a.put("minBid",         s.auctionHighBid + 1);
        return a;
    }

    /** Pending trade offer, with names + flags telling the viewer their role. */
    private Map<String, Object> tradeView(MonopolyState s, int me) {
        MonopolyState.Trade t = s.pendingTrade;
        Map<String, Object> tv = new LinkedHashMap<>();
        tv.put("from",             t.from);
        tv.put("fromName",         displayName(UUID.fromString(s.players.get(t.from))));
        tv.put("to",               t.to);
        tv.put("toName",           displayName(UUID.fromString(s.players.get(t.to))));
        tv.put("offerCash",        t.offerCash);
        tv.put("requestCash",      t.requestCash);
        tv.put("offerProps",       new ArrayList<>(t.offerProps));
        tv.put("requestProps",     new ArrayList<>(t.requestProps));
        tv.put("offerJailCards",   t.offerJailCards);
        tv.put("requestJailCards", t.requestJailCards);
        tv.put("incoming",         me == t.to);     // you can accept / decline
        tv.put("outgoing",         me == t.from);   // you can cancel
        return tv;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static int need(Integer square) {
        if (square == null)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Pick a property square.");
        if (square < 0 || square >= MonopolyBoard.SIZE)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Bad square.");
        return square;
    }

    private static int needAmount(Integer amount) {
        if (amount == null || amount < 1)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Enter a bid amount.");
        return amount;
    }

    private static int needTarget(Integer target) {
        if (target == null)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Pick a player.");
        return target;
    }

    // Tables created before the timeout/left fields existed deserialize with empty
    // lists — read defensively so an in-flight game doesn't blow up.
    private static int safeGet(List<Integer> l, int i) { return l != null && i < l.size() ? l.get(i) : 0; }
    private static boolean safeBool(List<Boolean> l, int i) { return l != null && i < l.size() && l.get(i); }

    private static int seatOf(MonopolyState s, UUID userId) {
        return s.players.indexOf(userId.toString());
    }

    private String displayName(UUID userId) {
        return userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");
    }

    private static String write(MonopolyState s) {
        try {
            return JSON.writeValueAsString(s);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise the table state", e);
        }
    }

    private MonopolyState read(String json) {
        try {
            MonopolyState s = JSON.readValue(json, MonopolyState.class);
            // Backfill fields added after some tables were already in flight.
            while (s.timeouts.size() < s.players.size()) s.timeouts.add(0);
            while (s.left.size()     < s.players.size()) s.left.add(false);
            hydrateNames(s);   // ensure the engine can log real names, not "P1"
            return s;
        } catch (Exception e) {
            throw new IllegalStateException("Could not read the table state", e);
        }
    }

    /** Resolve each seat's display name once (cached into the state + persisted). */
    private void hydrateNames(MonopolyState s) {
        if (s.names == null) s.names = new java.util.ArrayList<>();
        while (s.names.size() < s.players.size()) s.names.add(null);
        for (int i = 0; i < s.players.size(); i++) {
            if (s.names.get(i) == null) s.names.set(i, displayName(UUID.fromString(s.players.get(i))));
        }
    }
}
