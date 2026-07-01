package com.gridclan.controller;

import com.gridclan.dto.InitiateCardRequest;
import com.gridclan.dto.InitiatePurchaseRequest;
import com.gridclan.service.GemPurchaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Gem-purchase endpoints (Relworx mobile money).
 *
 * The webhook is PUBLIC (Relworx posts with no JWT) and is instead verified by
 * its signature inside the service — it is whitelisted in SecurityConfig. Every
 * other endpoint requires a logged-in user.
 */
@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final GemPurchaseService service;

    /** GET /payments/gems/quote?msisdn= — packs priced in the number's currency. */
    @GetMapping("/gems/quote")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> quote(@RequestParam String msisdn) {
        return ResponseEntity.ok(service.quote(msisdn));
    }

    /** POST /payments/gems/initiate — start a purchase; player approves on phone. */
    @PostMapping("/gems/initiate")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> initiate(
            @Valid @RequestBody InitiatePurchaseRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(service.initiate(userId, req.getPackId(), req.getMsisdn()));
    }

    /** GET /payments/gems/currencies — currencies offered for card payment. */
    @GetMapping("/gems/currencies")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> currencies() {
        return ResponseEntity.ok(service.supportedCurrencies());
    }

    /** GET /payments/gems/card-quote?currency= — packs priced in a chosen currency. */
    @GetMapping("/gems/card-quote")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> cardQuote(@RequestParam String currency) {
        return ResponseEntity.ok(service.cardQuote(currency));
    }

    /** POST /payments/gems/initiate-card — open a Visa/Mastercard payment session. */
    @PostMapping("/gems/initiate-card")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> initiateCard(
            @Valid @RequestBody InitiateCardRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(service.initiateCard(userId, req.getPackId(), req.getCurrency()));
    }

    /** GET /payments/gems/status?reference= — poll a purchase's state. */
    @GetMapping("/gems/status")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> status(
            @RequestParam String reference, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(service.status(userId, reference));
    }

    /**
     * POST /payments/relworx/webhook — Relworx payment callback (public; verified
     * by signature in the service). All headers are forwarded so the service can
     * read the signature + timestamp by their configured names.
     */
    @PostMapping("/relworx/webhook")
    public ResponseEntity<Map<String, Object>> webhook(
            @RequestBody String rawBody,
            @RequestHeader Map<String, String> headers) {
        service.handleWebhook(rawBody, headers);
        return ResponseEntity.ok(Map.of("received", true));
    }
}
