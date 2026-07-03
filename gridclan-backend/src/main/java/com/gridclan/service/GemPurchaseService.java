package com.gridclan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gridclan.config.GemStoreProperties;
import com.gridclan.config.RelworxProperties;
import com.gridclan.entity.GemPurchase;
import com.gridclan.repository.GemPurchaseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.*;

/**
 * Real-money gem purchases via Relworx mobile money.
 *
 * Trust model (server-authoritative, mirrors the rest of the economy):
 *   • Prices + gem amounts come from server config, never the client.
 *   • The charge currency is derived from the player's mobile-money number.
 *   • Gems are credited ONLY when a verified Relworx webhook confirms payment,
 *     and only once per purchase reference (idempotent) — never on the client's
 *     word, and never on the initiate call.
 *
 * Gems remain a closed-loop currency: buying adds gems, but there is still no path
 * OUT to real value (no cashout) — see {@link GemService}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GemPurchaseService {

    private final GemStoreProperties      store;
    private final RelworxProperties       relworx;
    private final RelworxClient           client;
    private final PhoneCurrencyResolver   currencyResolver;
    private final GemPurchaseRepository    purchaseRepo;
    private final GemService              gemService;
    private final AdRewardService         adRewardService;
    private final ObjectMapper            objectMapper;

    // ── Quote ────────────────────────────────────────────────────────────────

    /**
     * The packs a player can buy, priced in the currency of their mobile-money
     * number. Returns the resolved currency, whether the store is configured, and
     * each pack with its price in that currency (packs with no price for the
     * currency are omitted).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> quote(String msisdn) {
        String currency = currencyResolver.currencyFor(msisdn);
        List<Map<String, Object>> packs = currency != null ? packsFor(currency) : List.of();
        // Best-effort: confirm it's a real mobile-money line and fetch the account
        // name so the UI can show "Paying as NAME". Never blocks the quote.
        String customerName = null;
        boolean numberValid = false;
        if (currency != null && relworx.isConfigured()) {
            var v = client.validate(currencyResolver.normalise(msisdn));
            numberValid = v.valid();
            customerName = v.customerName();
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured",   relworx.isConfigured());
        out.put("currency",     currency);   // null = country not supported
        out.put("numberValid",  numberValid);
        out.put("customerName", customerName);
        out.put("packs",        packs);
        return out;
    }

    // ── Card (Visa/Mastercard) ──────────────────────────────────────────────────

    /** Currencies any pack is priced in — for the card payment currency picker. */
    @Transactional(readOnly = true)
    public Map<String, Object> supportedCurrencies() {
        LinkedHashSet<String> currencies = new LinkedHashSet<>();
        for (GemStoreProperties.Pack p : store.getPacks()) currencies.addAll(p.getPrices().keySet());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured", relworx.isConfigured());
        out.put("currencies", new ArrayList<>(currencies));
        return out;
    }

    /** Packs priced in an explicitly chosen currency (card flow has no phone number). */
    @Transactional(readOnly = true)
    public Map<String, Object> cardQuote(String currency) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured", relworx.isConfigured());
        out.put("currency",   currency);
        out.put("packs",      currency != null ? packsFor(currency) : List.of());
        return out;
    }

    /** Start a card purchase: create a pending record and open a Relworx hosted
     *  payment session. Returns the {@code paymentUrl} the player is sent to. */
    @Transactional
    public Map<String, Object> initiateCard(UUID userId, String packId, String currency) {
        if (!relworx.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "The gem store isn't available right now.");
        }
        GemStoreProperties.Pack pack = store.pack(packId);
        if (pack == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown gem pack.");
        BigDecimal price = pack.priceFor(currency);
        if (price == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "That pack isn't available in " + currency + ".");
        }

        String reference = "GEMS-" + UUID.randomUUID().toString().replace("-", "");
        GemPurchase purchase = GemPurchase.builder()
            .userId(userId).packId(pack.getId()).gems(pack.getGems())
            .currency(currency).amount(price).method("CARD")
            .reference(reference).status("PENDING")
            .build();
        purchaseRepo.save(purchase);

        var session = client.requestVisaSession(reference, currency, price,
            "GridClan gems — " + pack.getGems() + " gems");
        if (!session.accepted() || session.paymentUrl() == null) {
            purchase.setStatus("FAILED");
            purchaseRepo.save(purchase);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                session.message() != null ? session.message() : "Could not start the card payment.");
        }
        // No Relworx internal_reference for cards (only a payment_url) — crediting
        // arrives via the webhook, matched on our reference (= customer_reference).
        log.info("Card gem purchase initiated: user={} pack={} {} {} ref={}",
            userId, pack.getId(), price, currency, reference);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference",  reference);
        out.put("status",     "PENDING");
        out.put("gems",       pack.getGems());
        out.put("amount",     price);
        out.put("currency",   currency);
        out.put("paymentUrl", session.paymentUrl());
        return out;
    }

    /** Build the displayable pack list for a currency (packs without a price for it
     *  are omitted). Shared by the mobile-money quote and the card quote. */
    private List<Map<String, Object>> packsFor(String currency) {
        List<Map<String, Object>> packs = new ArrayList<>();
        for (GemStoreProperties.Pack p : store.getPacks()) {
            BigDecimal price = p.priceFor(currency);
            if (price == null) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",    p.getId());
            m.put("label", p.getLabel());
            m.put("gems",  p.getGems());
            m.put("adFreeMonths", p.getAdFreeMonths());
            m.put("price", price);
            packs.add(m);
        }
        return packs;
    }

    // ── Initiate ───────────────────────────────────────────────────────────────

    /** Start a purchase: create a pending record and ask Relworx to collect. The
     *  player then approves the mobile-money prompt on their phone; the webhook
     *  later credits the gems. */
    @Transactional
    public Map<String, Object> initiate(UUID userId, String packId, String rawMsisdn) {
        if (!relworx.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "The gem store isn't available right now.");
        }
        String msisdn = currencyResolver.normalise(rawMsisdn);
        String currency = currencyResolver.currencyFor(msisdn);
        if (msisdn == null || currency == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "We don't support mobile-money payments from that number's country yet.");
        }
        GemStoreProperties.Pack pack = store.pack(packId);
        if (pack == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown gem pack.");
        }
        BigDecimal price = pack.priceFor(currency);
        if (price == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "That pack isn't available in " + currency + ".");
        }

        String reference = "GEMS-" + UUID.randomUUID().toString().replace("-", "");
        GemPurchase purchase = GemPurchase.builder()
            .userId(userId).packId(pack.getId()).gems(pack.getGems())
            .currency(currency).amount(price).msisdn(msisdn)
            .reference(reference).status("PENDING")
            .build();
        purchaseRepo.save(purchase);

        var result = client.requestPayment(reference, msisdn, currency, price,
            "GridClan gems — " + pack.getGems() + " gems");
        if (!result.accepted()) {
            purchase.setStatus("FAILED");
            purchaseRepo.save(purchase);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                result.message() != null ? result.message() : "Could not start the payment.");
        }
        purchase.setProviderReference(result.providerReference());
        purchaseRepo.save(purchase);
        log.info("Gem purchase initiated: user={} pack={} {} {} ref={}",
            userId, pack.getId(), price, currency, reference);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference", reference);
        out.put("status",    "PENDING");
        out.put("gems",      pack.getGems());
        out.put("amount",    price);
        out.put("currency",  currency);
        out.put("message",   "Approve the payment prompt on your phone.");
        return out;
    }

    // ── Webhook (Relworx → us) ──────────────────────────────────────────────────

    /**
     * Handle a Relworx payment webhook: verify it's genuine (signature over
     * url + timestamp + sorted status/customer_reference/internal_reference), then
     * credit gems exactly once if it confirms success. Idempotent per reference.
     *
     * Relworx echoes OUR reference back as {@code customer_reference}, so that's
     * what we match our purchase on.
     */
    @Transactional
    public void handleWebhook(String rawBody, Map<String, String> headers) {
        Map<String, Object> payload = parse(rawBody);

        // Headers come case-insensitive; look them up tolerantly.
        String timestamp = header(headers, relworx.getTimestampHeader());
        String signature = header(headers, relworx.getSignatureHeader());

        // The exact three fields Relworx signs (sorted by key inside the client).
        Map<String, String> signed = new LinkedHashMap<>();
        signed.put("status",             str(payload.get("status")));
        signed.put("customer_reference", str(payload.get("customer_reference")));
        signed.put("internal_reference", str(payload.get("internal_reference")));

        if (!client.verifyWebhook(relworx.getWebhookUrl(), timestamp, signed, signature)) {
            // Log the header names we received so the exact ones can be confirmed.
            log.warn("Webhook signature check failed. Header keys received: {}", headers.keySet());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bad webhook signature.");
        }

        String reference = str(payload.get("customer_reference"));
        if (reference == null) {
            log.warn("Webhook with no customer_reference: {}", rawBody);
            return;   // nothing to act on
        }
        GemPurchase purchase = purchaseRepo.lockByReference(reference).orElse(null);
        if (purchase == null) {
            log.warn("Webhook for unknown reference={}", reference);
            return;
        }
        if ("SUCCESSFUL".equals(purchase.getStatus())) {
            return;   // already credited — idempotent no-op
        }

        applyOutcome(purchase, isSuccess(payload), str(payload.get("message")));
    }

    /** Settle a still-pending purchase: credit gems once on success, else mark failed
     *  and record the provider's reason. Shared by the webhook + status-poll fallback;
     *  safe to call repeatedly. */
    private void applyOutcome(GemPurchase purchase, boolean success, String reason) {
        if ("SUCCESSFUL".equals(purchase.getStatus())) return;   // already credited
        if (success) {
            purchase.setStatus("SUCCESSFUL");
            purchaseRepo.save(purchase);
            gemService.creditGems(purchase.getUserId(), purchase.getGems(),
                "PURCHASE", purchase.getId());
            // Buying a pack also buys ad-FREE months: the post-game popup ads
            // stop until the bought window runs out (1/4/8 months by pack).
            GemStoreProperties.Pack pack = store.pack(purchase.getPackId());
            if (pack != null && pack.getAdFreeMonths() > 0) {
                adRewardService.extendAdFree(purchase.getUserId(), pack.getAdFreeMonths());
            }
            log.info("Gem purchase credited: user={} gems={} ref={}",
                purchase.getUserId(), purchase.getGems(), purchase.getReference());
        } else {
            purchase.setStatus("FAILED");
            if (reason != null && !reason.isBlank()) {
                purchase.setFailureReason(reason.length() > 255 ? reason.substring(0, 255) : reason);
            }
            purchaseRepo.save(purchase);
            log.info("Gem purchase failed: ref={} reason={}", purchase.getReference(), reason);
        }
    }

    // ── Status (client polling fallback) ────────────────────────────────────────

    @Transactional
    public Map<String, Object> status(UUID userId, String reference) {
        GemPurchase p = purchaseRepo.lockByReference(reference)
            .filter(gp -> gp.getUserId().equals(userId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase not found."));

        // Confirmation fallback (mobile money only — we have Relworx's
        // internal_reference there): if still pending, ask Relworx directly. This
        // lets a purchase settle even when the webhook is delayed/not configured.
        // Card purchases confirm via the webhook (matched on our reference).
        if ("PENDING".equals(p.getStatus()) && "MOBILE_MONEY".equals(p.getMethod())
                && relworx.isConfigured() && p.getProviderReference() != null) {
            var st = client.checkStatus(p.getProviderReference());
            if (st.found() && st.status() != null) {
                String s = st.status().toLowerCase();
                if (s.contains("success")) applyOutcome(p, true, null);
                else if (s.equals("failed")) applyOutcome(p, false, st.message());
                // "pending" / anything else → leave as is, poll again later
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference", p.getReference());
        out.put("status",    p.getStatus());
        out.put("gems",      p.getGems());
        out.put("reason",    p.getFailureReason());   // provider's reason when FAILED
        return out;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

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
