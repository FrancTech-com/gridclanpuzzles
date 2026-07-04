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

    /** POST /monopoly/{id}/act — take an action on your turn. */
    @PostMapping("/{id}/act")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> act(
            @PathVariable UUID id, @Validated @RequestBody ActRequest req, Authentication auth) {
        return ResponseEntity.ok(service.act(userId(auth), id, req.getAction(), req.getSquare()));
    }

    private static UUID userId(Authentication auth) { return (UUID) auth.getPrincipal(); }

    @Getter @Setter
    static class ActRequest {
        /** ROLL | BUY | SKIP_BUY | BUILD | SELL_HOUSE | MORTGAGE | UNMORTGAGE | PAY_JAIL | USE_JAIL_CARD | END_TURN */
        @NotNull
        private String action;
        private Integer square;
    }
}
