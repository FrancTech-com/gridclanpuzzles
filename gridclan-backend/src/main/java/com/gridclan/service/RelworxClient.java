package com.gridclan.service;

import com.gridclan.config.RelworxProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Thin client for Relworx mobile-money collections. ALL Relworx-specific wire
 * details are isolated here, so adapting to the exact API docs is a localised change.
 *
 * Built to Relworx's documented v2 request-payment shape:
 *   POST {baseUrl}/mobile-money/request-payment
 *   Headers: Authorization: Bearer <apiKey>, Accept: application/vnd.relworx.v2
 *   Body:    { account_no, reference, msisdn, currency, amount, description }
 *
 * ⚠ CONFIRM AGAINST YOUR RELWORX DOCS once you have them: the exact path, the
 * Accept/version header, the body field names, the success flag + provider
 * reference field in the response, and the webhook signature scheme below.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RelworxClient {

    private final RelworxProperties props;
    private final RestTemplate rest = new RestTemplate();

    /** Outcome of asking Relworx to collect: whether it was accepted + their ref. */
    public record RequestResult(boolean accepted, String providerReference, String message) {}

    /** Result of validating a mobile-money number. */
    public record ValidationResult(boolean valid, String customerName, String message) {}

    /** Result of opening a Visa/Mastercard session: the hosted payment URL. */
    public record VisaSessionResult(boolean accepted, String paymentUrl, String message) {}

    /**
     * Open a Visa/Mastercard payment session (POST /visa/request-session). Returns
     * the Relworx-hosted {@code payment_url} the player is sent to in order to
     * enter their card details. Confirmation arrives later via webhook/status,
     * exactly like mobile money.
     */
    public VisaSessionResult requestVisaSession(String reference, String currency,
                                                BigDecimal amount, String description) {
        HttpHeaders headers = jsonAuthHeaders();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("account_no",  props.getAccountNo());
        body.put("reference",   reference);
        body.put("currency",    currency);
        body.put("amount",      amount.setScale(2, java.math.RoundingMode.HALF_UP));
        body.put("description", description);
        try {
            ResponseEntity<Map<String, Object>> resp = rest.exchange(
                props.getBaseUrl() + "/visa/request-session", HttpMethod.POST,
                new HttpEntity<>(body, headers), mapType());
            Map<String, Object> map = resp.getBody() != null ? resp.getBody() : Map.of();
            boolean ok = resp.getStatusCode().is2xxSuccessful() && Boolean.TRUE.equals(map.get("success"));
            return new VisaSessionResult(ok, str(map.get("payment_url")), str(map.get("message")));
        } catch (org.springframework.web.client.RestClientResponseException he) {
            log.error("Relworx visa request-session HTTP {} ref={}: {}",
                he.getStatusCode(), reference, he.getResponseBodyAsString());
            return new VisaSessionResult(false, null, "Card payment could not be started.");
        } catch (Exception e) {
            log.error("Relworx visa request-session failed ref={}: {}", reference, e.toString());
            return new VisaSessionResult(false, null, "Card payment could not be started.");
        }
    }

    /** Result of polling a request's status: "success" / "pending" / "failed" / null,
     *  plus the provider's human message (e.g. a failure reason). */
    public record StatusResult(boolean found, String status, String message) {}

    /**
     * Validate a mobile-money number (POST /mobile-money/validate). Returns whether
     * it's a usable mobile-money line and the registered customer name, so the UI
     * can show "Paying as NAME" before charging.
     */
    public ValidationResult validate(String msisdn) {
        HttpHeaders headers = jsonAuthHeaders();
        Map<String, Object> body = Map.of("msisdn", msisdn);
        try {
            ResponseEntity<Map<String, Object>> resp = rest.exchange(
                props.getBaseUrl() + "/mobile-money/validate", HttpMethod.POST,
                new HttpEntity<>(body, headers), mapType());
            Map<String, Object> map = resp.getBody() != null ? resp.getBody() : Map.of();
            boolean ok = Boolean.TRUE.equals(map.get("success"));
            return new ValidationResult(ok, str(map.get("customer_name")), str(map.get("message")));
        } catch (Exception e) {
            log.warn("Relworx validate failed for {}: {}", msisdn, e.getMessage());
            return new ValidationResult(false, null, "Could not validate the number.");
        }
    }

    /**
     * Poll a collection's status (GET /mobile-money/check-request-status). Used as a
     * confirmation fallback when the webhook hasn't (yet) arrived — Relworx is the
     * source of truth, so this can confirm payment without the webhook configured.
     */
    public StatusResult checkStatus(String internalReference) {
        HttpHeaders headers = jsonAuthHeaders();
        String url = props.getBaseUrl() + "/mobile-money/check-request-status"
            + "?internal_reference=" + internalReference
            + "&account_no=" + props.getAccountNo();
        try {
            ResponseEntity<Map<String, Object>> resp = rest.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), mapType());
            Map<String, Object> map = resp.getBody() != null ? resp.getBody() : Map.of();
            if (!Boolean.TRUE.equals(map.get("success"))) return new StatusResult(false, null, null);
            Object status = map.get("status") != null ? map.get("status") : map.get("request_status");
            return new StatusResult(true, status == null ? null : String.valueOf(status),
                str(map.get("message")));
        } catch (Exception e) {
            log.warn("Relworx check-request-status failed ref={}: {}", internalReference, e.getMessage());
            return new StatusResult(false, null, null);
        }
    }

    private HttpHeaders jsonAuthHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(props.getApiKey());
        headers.set(HttpHeaders.ACCEPT, "application/vnd.relworx.v2");
        return headers;
    }

    private static org.springframework.core.ParameterizedTypeReference<Map<String, Object>> mapType() {
        return new org.springframework.core.ParameterizedTypeReference<>() {};
    }

    /**
     * Ask Relworx to prompt {@code msisdn} to pay {@code amount} {@code currency}.
     * Returns whether the request was accepted (the actual money movement is later
     * confirmed by webhook), Relworx's reference, and any message.
     */
    public RequestResult requestPayment(String reference, String msisdn, String currency,
                                        BigDecimal amount, String description) {
        HttpHeaders headers = jsonAuthHeaders();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("account_no",  props.getAccountNo());
        body.put("reference",   reference);
        body.put("msisdn",      msisdn);
        body.put("currency",    currency);
        // Send with 2 decimals (e.g. 7000.00) to match Relworx's documented format.
        body.put("amount",      amount.setScale(2, java.math.RoundingMode.HALF_UP));
        body.put("description", description);

        String url = props.getBaseUrl() + "/mobile-money/request-payment";
        try {
            ResponseEntity<Map<String, Object>> resp = rest.exchange(
                url, HttpMethod.POST, new HttpEntity<>(body, headers), mapType());
            Map<String, Object> map = resp.getBody() != null ? resp.getBody() : Map.of();
            boolean ok = resp.getStatusCode().is2xxSuccessful()
                && Boolean.TRUE.equals(map.get("success"));
            String providerRef = str(map.get("internal_reference"));
            String message = str(map.get("message"));
            log.info("Relworx request-payment ref={} accepted={} providerRef={}",
                reference, ok, providerRef);
            return new RequestResult(ok, providerRef, message);
        } catch (org.springframework.web.client.RestClientResponseException he) {
            log.error("Relworx request-payment HTTP {} ref={}: {}",
                he.getStatusCode(), reference, he.getResponseBodyAsString());
            return new RequestResult(false, null, "Payment request failed.");
        } catch (Exception e) {
            log.error("Relworx request-payment failed ref={}: {}", reference, e.toString());
            return new RequestResult(false, null, "Payment request failed.");
        }
    }

    /**
     * Verify a webhook is genuinely from Relworx, per their documented scheme:
     *   signed = url + timestamp + (for each param, sorted by key: key + value)
     *   signature = hex( HMAC-SHA256(signed, webhook_key) )
     * where {@code params} are exactly the status / customer_reference /
     * internal_reference fields from the body, sorted by key (ksort).
     *
     * @param url        the registered webhook URL (must match what Relworx signs)
     * @param timestamp  the signature timestamp from the request header
     * @param params     the three signed fields from the body (key → value)
     * @param signature  the signature from the request header
     */
    public boolean verifyWebhook(String url, String timestamp,
                                 Map<String, String> params, String signature) {
        String secret = props.getWebhookSecret();
        if (secret == null || secret.isBlank() || signature == null
            || url == null || timestamp == null) return false;
        try {
            StringBuilder signed = new StringBuilder(url).append(timestamp);
            // ksort: sort the params by key, then concatenate key+value.
            new TreeMap<>(params).forEach((k, v) -> signed.append(k).append(v == null ? "" : v));

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(signed.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(raw.length * 2);
            for (byte b : raw) hex.append(String.format("%02x", b));

            return constantTimeEquals(hex.toString(), signature.trim());
        } catch (Exception e) {
            log.warn("Webhook signature verification error: {}", e.getMessage());
            return false;
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
}
