package com.gridclan.controller;

import com.gridclan.dto.InitiateCardRequest;
import com.gridclan.dto.InitiatePurchaseRequest;
import com.gridclan.dto.InitiateWithdrawalRequest;
import com.gridclan.entity.PlayerWallet;
import com.gridclan.service.GemPurchaseService;
import com.gridclan.service.WalletService;
import com.gridclan.service.WithdrawalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
    private final WalletService      walletService;
    private final WithdrawalService  withdrawalService;

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

    // ── Prize wallet + withdrawals (money OUT via Relworx send-payment) ────────

    /** GET /payments/wallet — the player's prize balances, one per currency. */
    @GetMapping("/wallet")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> wallet(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        List<Map<String, Object>> out = new ArrayList<>();
        for (PlayerWallet w : walletService.balances(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("currency",          w.getCurrency());
            m.put("balance",           w.getBalance());
            m.put("lifetimeEarned",    w.getLifetimeEarned());
            m.put("lifetimeWithdrawn", w.getLifetimeWithdrawn());
            out.add(m);
        }
        return ResponseEntity.ok(out);
    }

    /** GET /payments/withdraw/quote?msisdn= — payout currency, balance + limits. */
    @GetMapping("/withdraw/quote")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> withdrawQuote(
            @RequestParam String msisdn, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(withdrawalService.quote(userId, msisdn));
    }

    /** POST /payments/withdraw/initiate — hold funds and send the payout. */
    @PostMapping("/withdraw/initiate")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> withdrawInitiate(
            @Valid @RequestBody InitiateWithdrawalRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(
            withdrawalService.initiate(userId, req.getMsisdn(), req.getAmount()));
    }

    /** GET /payments/withdraw/status?reference= — poll a withdrawal's state. */
    @GetMapping("/withdraw/status")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> withdrawStatus(
            @RequestParam String reference, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(withdrawalService.status(userId, reference));
    }

    /** GET /payments/withdraw/history — the player's recent withdrawals. */
    @GetMapping("/withdraw/history")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> withdrawHistory(
            @RequestParam(defaultValue = "20") int limit, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(withdrawalService.history(userId, Math.min(limit, 100)));
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

    /**
     * POST /payments/relworx/send-payment/webhook — Relworx SEND-PAYMENT (payout)
     * callback (public; verified by signature in the service). Register this URL
     * as the send-payment webhook in the Relworx dashboard.
     */
    @PostMapping("/relworx/send-payment/webhook")
    public ResponseEntity<Map<String, Object>> sendPaymentWebhook(
            @RequestBody String rawBody,
            @RequestHeader Map<String, String> headers) {
        withdrawalService.handleWebhook(rawBody, headers);
        return ResponseEntity.ok(Map.of("received", true));
    }
}
