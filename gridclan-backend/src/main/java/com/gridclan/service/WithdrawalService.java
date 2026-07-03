package com.gridclan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.config.RelworxProperties;
import com.gridclan.config.WalletProperties;
import com.gridclan.entity.Withdrawal;
import com.gridclan.repository.WithdrawalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.*;

/**
 * Real-cash withdrawals: prize-wallet balance → the player's mobile-money number
 * via Relworx send-payment.
 *
 * Trust model (server-authoritative, mirrors gem purchases):
 *   • The payout currency is derived from the destination number's country and
 *     must match a wallet balance the player actually holds.
 *   • Funds are HELD (debited) BEFORE Relworx is asked to send — the player can
 *     never spend or re-withdraw money that's on its way out.
 *   • The hold is refunded ONLY on a definitive failure (Relworx refused, or a
 *     verified webhook / status poll says the transfer failed), and only once
 *     per withdrawal (idempotent). An AMBIGUOUS send (timeout) keeps the hold
 *     and stays PENDING until Relworx tells us the truth — never auto-refunded,
 *     so a payout that actually went through can't also hand the money back.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WithdrawalService {

    private final RelworxProperties     relworx;
    private final WalletProperties      walletProps;
    private final RelworxClient         client;
    private final PhoneCurrencyResolver currencyResolver;
    private final WithdrawalRepository  withdrawalRepo;
    private final WalletService         walletService;
    private final ObjectMapper          objectMapper;

    // ── Quote ────────────────────────────────────────────────────────────────

    /**
     * What withdrawing to this number looks like: the payout currency, the
     * player's balance in it, the min/max per withdrawal, and (best-effort) the
     * registered account name so the UI can show "Sending to NAME".
     */
    @Transactional(readOnly = true)
    public Map<String, Object> quote(UUID userId, String rawMsisdn) {
        String msisdn = currencyResolver.normalise(rawMsisdn);
        String currency = currencyResolver.currencyFor(msisdn);

        String customerName = null;
        boolean numberValid = false;
        if (currency != null && relworx.isConfigured()) {
            var v = client.validate(msisdn);
            numberValid = v.valid();
            customerName = v.customerName();
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured",   relworx.isConfigured());
        out.put("currency",     currency);   // null = country not supported
        out.put("numberValid",  numberValid);
        out.put("customerName", customerName);
        out.put("balance",      currency != null ? walletService.balance(userId, currency) : BigDecimal.ZERO);
        out.put("minAmount",    currency != null ? walletProps.minFor(currency) : null);
        out.put("maxAmount",    currency != null ? walletProps.maxFor(currency) : null);
        return out;
    }

    // ── Initiate ─────────────────────────────────────────────────────────────

    /**
     * Start a withdrawal: validate, HOLD the funds, then ask Relworx to send.
     * A refusal rolls the whole thing back (balance untouched); an ambiguous
     * outcome keeps the hold and the PENDING record for the webhook to settle.
     */
    @Transactional
    public Map<String, Object> initiate(UUID userId, String rawMsisdn, BigDecimal amount) {
        if (!relworx.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Withdrawals aren't available right now.");
        }
        String msisdn = currencyResolver.normalise(rawMsisdn);
        String currency = currencyResolver.currencyFor(msisdn);
        if (msisdn == null || currency == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "We don't support withdrawals to that number's country yet.");
        }
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid amount.");
        }
        BigDecimal min = walletProps.minFor(currency);
        if (amount.compareTo(min) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "The minimum withdrawal is " + min.stripTrailingZeros().toPlainString()
                + " " + currency + ".");
        }
        BigDecimal max = walletProps.maxFor(currency);
        if (max != null && amount.compareTo(max) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "The maximum per withdrawal is " + max.stripTrailingZeros().toPlainString()
                + " " + currency + ".");
        }

        String reference = "WDRW-" + UUID.randomUUID().toString().replace("-", "");
        Withdrawal w = Withdrawal.builder()
            .userId(userId).msisdn(msisdn).currency(currency).amount(amount)
            .reference(reference).status("PENDING")
            .build();
        withdrawalRepo.save(w);

        // Hold first: money leaves the balance before it can leave the platform.
        walletService.hold(userId, currency, amount, w.getId());

        var result = client.sendPayment(reference, msisdn, currency, amount,
            "GridClan prize withdrawal");
        switch (result.outcome()) {
            case REJECTED ->
                // Definitive refusal → abort everything (tx rollback releases the
                // hold and discards the record); the balance is untouched.
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    result.message() != null ? result.message() : "Could not start the payout.");
            case ACCEPTED -> {
                w.setProviderReference(result.providerReference());
                withdrawalRepo.save(w);
            }
            case UNKNOWN ->
                // Might have gone through — keep the hold + PENDING record and let
                // the webhook / status poll settle it. NEVER refund here.
                log.warn("Withdrawal {} outcome unknown — awaiting webhook/status", reference);
        }
        log.info("Withdrawal initiated: user={} {} {} to {} ref={}",
            userId, amount, currency, msisdn, reference);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference", reference);
        out.put("status",    "PENDING");
        out.put("amount",    amount);
        out.put("currency",  currency);
        out.put("message",   "Your withdrawal is on its way.");
        return out;
    }

    // ── Webhook (Relworx → us) ───────────────────────────────────────────────

    /**
     * Handle a Relworx SEND-PAYMENT webhook: verify the signature (same scheme as
     * collections, signed over the send-payment webhook URL), then settle the
     * withdrawal exactly once — refunding the hold on failure. Idempotent per
     * reference.
     */
    @Transactional
    public void handleWebhook(String rawBody, Map<String, String> headers) {
        Map<String, Object> payload = parse(rawBody);

        String timestamp = header(headers, relworx.getTimestampHeader());
        String signature = header(headers, relworx.getSignatureHeader());

        Map<String, String> signed = new LinkedHashMap<>();
        signed.put("status",             str(payload.get("status")));
        signed.put("customer_reference", str(payload.get("customer_reference")));
        signed.put("internal_reference", str(payload.get("internal_reference")));

        if (!client.verifyWebhook(relworx.getSendWebhookUrl(), timestamp, signed, signature)) {
            log.warn("Send-payment webhook signature check failed. Header keys: {}", headers.keySet());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bad webhook signature.");
        }

        String reference = str(payload.get("customer_reference"));
        if (reference == null) {
            log.warn("Send-payment webhook with no customer_reference: {}", rawBody);
            return;
        }
        Withdrawal w = withdrawalRepo.lockByReference(reference).orElse(null);
        if (w == null) {
            log.warn("Send-payment webhook for unknown reference={}", reference);
            return;
        }
        applyOutcome(w, isSuccess(payload), str(payload.get("message")));
    }

    /** Settle a still-pending withdrawal: finalise on success, refund the hold on
     *  failure — each exactly once. Shared by webhook + status-poll fallback; a
     *  settled withdrawal is never touched again. */
    private void applyOutcome(Withdrawal w, boolean success, String reason) {
        if (!"PENDING".equals(w.getStatus())) return;   // already settled — idempotent no-op
        if (success) {
            w.setStatus("SUCCESSFUL");
            withdrawalRepo.save(w);
            walletService.markWithdrawn(w.getUserId(), w.getCurrency(), w.getAmount());
            log.info("Withdrawal delivered: user={} {} {} ref={}",
                w.getUserId(), w.getAmount(), w.getCurrency(), w.getReference());
        } else {
            w.setStatus("FAILED");
            if (reason != null && !reason.isBlank()) {
                w.setFailureReason(reason.length() > 255 ? reason.substring(0, 255) : reason);
            }
            withdrawalRepo.save(w);
            walletService.refundHold(w.getUserId(), w.getCurrency(), w.getAmount(),
                w.getId(), reason);
            log.info("Withdrawal failed + refunded: ref={} reason={}", w.getReference(), reason);
        }
    }

    // ── Status (client polling fallback) ─────────────────────────────────────

    @Transactional
    public Map<String, Object> status(UUID userId, String reference) {
        Withdrawal w = withdrawalRepo.lockByReference(reference)
            .filter(x -> x.getUserId().equals(userId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Withdrawal not found."));

        // Confirmation fallback: if still pending and we have Relworx's reference,
        // ask them directly — lets a payout settle even when the webhook is
        // delayed/not configured. Relworx is the source of truth.
        if ("PENDING".equals(w.getStatus()) && relworx.isConfigured()
                && w.getProviderReference() != null) {
            var st = client.checkStatus(w.getProviderReference());
            if (st.found() && st.status() != null) {
                String s = st.status().toLowerCase();
                if (s.contains("success")) applyOutcome(w, true, null);
                else if (s.equals("failed")) applyOutcome(w, false, st.message());
                // "pending" / anything else → leave as is, poll again later
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference", w.getReference());
        out.put("status",    w.getStatus());
        out.put("amount",    w.getAmount());
        out.put("currency",  w.getCurrency());
        out.put("reason",    w.getFailureReason());   // provider's reason when FAILED
        return out;
    }

    // ── History ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(UUID userId, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Withdrawal w : withdrawalRepo.findByUserIdOrderByCreatedAtDesc(
                userId, org.springframework.data.domain.PageRequest.of(0, limit))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reference", w.getReference());
            m.put("msisdn",    w.getMsisdn());
            m.put("amount",    w.getAmount());
            m.put("currency",  w.getCurrency());
            m.put("status",    w.getStatus());
            m.put("reason",    w.getFailureReason());
            m.put("createdAt", w.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Case-insensitive header lookup (HTTP header names aren't case-sensitive). */
    private static String header(Map<String, String> headers, String name) {
        if (headers == null || name == null) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (name.equalsIgnoreCase(e.getKey())) return e.getValue();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String rawBody) {
        try {
            return objectMapper.readValue(rawBody, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** A success status from common provider shapes: status string or success flag. */
    private boolean isSuccess(Map<String, Object> payload) {
        Object status = extract(payload, "status", "transaction_status");
        if (status != null) {
            String s = String.valueOf(status).toLowerCase();
            return s.contains("success") || s.equals("completed") || s.equals("paid");
        }
        Object success = extract(payload, "success");
        return Boolean.TRUE.equals(success) || "true".equalsIgnoreCase(String.valueOf(success));
    }

    /** First non-null value among the given keys, checking a nested "data" object too. */
    @SuppressWarnings("unchecked")
    private Object extract(Map<String, Object> payload, String... keys) {
        Map<String, Object> data = payload.get("data") instanceof Map
            ? (Map<String, Object>) payload.get("data") : Map.of();
        for (String k : keys) {
            if (payload.get(k) != null) return payload.get(k);
            if (data.get(k) != null)    return data.get(k);
        }
        return null;
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
}
