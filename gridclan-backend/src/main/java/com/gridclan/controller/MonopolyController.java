package com.gridclan.controller;

import com.gridclan.monopoly.MonopolyBoard;
import com.gridclan.service.MonopolyGameService;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Monopoly — tournament-only tables (2-8 players). Tables are created by the
 * tournament bracket; players act through this API and everyone (including
 * eliminated spectators) can read the table state.
 */
@RestController
@RequestMapping("/monopoly")
@RequiredArgsConstructor
public class MonopolyController {

    private final MonopolyGameService service;

    /** GET /monopoly/board — the static 40-square board (names, prices, rents). */
    @GetMapping("/board")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> board() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (MonopolyBoard.Square sq : MonopolyBoard.SQUARES) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("index",     sq.index());
            m.put("type",      sq.type());
            m.put("name",      sq.name());
            m.put("group",     sq.group());
            m.put("price",     sq.price());
            m.put("houseCost", sq.houseCost());
            m.put("rent",      sq.rent());
            out.add(m);
        }
        return ResponseEntity.ok(out);
    }

    /** GET /monopoly/{id} — full table state (public; spectators welcome). */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.get(userId(auth), id));
    }

    /** POST /monopoly/{id}/act — take an action on your turn (or bid/respond off-turn). */
    @PostMapping("/{id}/act")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> act(
            @PathVariable UUID id, @Validated @RequestBody ActRequest req, Authentication auth) {
        MonopolyGameService.TradePayload trade = req.getTrade() == null ? null
            : new MonopolyGameService.TradePayload(
                req.getTrade().getTo(),
                req.getTrade().getOfferCash(),
                req.getTrade().getRequestCash(),
                req.getTrade().getOfferProps(),
                req.getTrade().getRequestProps(),
                req.getTrade().getOfferJailCards(),
                req.getTrade().getRequestJailCards());
        return ResponseEntity.ok(
            service.act(userId(auth), id, req.getAction(), req.getSquare(), req.getAmount(), trade, req.getTarget()));
    }

    /** POST /monopoly/{id}/pause — freeze the turn clock for the table. */
    @PostMapping("/{id}/pause")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> pause(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.pause(userId(auth), id));
    }

    /** POST /monopoly/{id}/resume — resume the table. */
    @PostMapping("/{id}/resume")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> resume(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(service.resume(userId(auth), id));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    @Getter @Setter
    static class ActRequest {
        /** ROLL | BUY | SKIP_BUY | BUILD | SELL_HOUSE | MORTGAGE | UNMORTGAGE | PAY_JAIL |
         *  USE_JAIL_CARD | END_TURN | AUCTION_BID | AUCTION_PASS | PROPOSE_TRADE |
         *  COUNTER_TRADE | ACCEPT_TRADE | DECLINE_TRADE | KICK */
        @NotNull
        private String action;
        private Integer square;   // BUILD / SELL_HOUSE / MORTGAGE / UNMORTGAGE
        private Integer amount;   // AUCTION_BID
        private TradeDto trade;   // PROPOSE_TRADE / COUNTER_TRADE
        private Integer target;   // KICK (seat to disable)
    }

    @Getter @Setter
    static class TradeDto {
        private Integer to;
        private Integer offerCash;
        private Integer requestCash;
        private List<Integer> offerProps;
        private List<Integer> requestProps;
        private Integer offerJailCards;
        private Integer requestJailCards;
    }
}
