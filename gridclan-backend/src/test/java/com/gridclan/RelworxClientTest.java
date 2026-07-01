package com.gridclan;

import com.gridclan.config.RelworxProperties;
import com.gridclan.service.RelworxClient;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Locks the Relworx webhook signature scheme:
 *   signed = url + timestamp + (ksort(params) → key+value…)
 *   sig    = hex(HMAC-SHA256(signed, webhook_key))
 * (matches Relworx's documented PHP generateSignature).
 */
class RelworxClientTest {

    private static final String KEY = "test-webhook-key";
    private static final String URL = "https://api.gridclanpuzzle.win/payments/relworx/webhook";
    private static final String TS  = "2025-04-10T15:12:58.977+03:00";

    private RelworxClient client() {
        RelworxProperties p = new RelworxProperties();
        p.setWebhookSecret(KEY);
        return new RelworxClient(p);
    }

    /** Independent re-implementation of the documented algorithm. */
    private static String expectedSig(Map<String, String> params) throws Exception {
        StringBuilder signed = new StringBuilder(URL).append(TS);
        new TreeMap<>(params).forEach((k, v) -> signed.append(k).append(v));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(KEY.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] raw = mac.doFinal(signed.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : raw) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    @Test
    void verifyWebhook_acceptsCorrectSignature_rejectsTampered() throws Exception {
        // Deliberately not in sorted order — the client must ksort before signing.
        Map<String, String> params = new LinkedHashMap<>();
        params.put("status", "success");
        params.put("customer_reference", "GEMS-abc123");
        params.put("internal_reference", "fdd10a4c5d6b459d54ebc5f09d095101");

        String good = expectedSig(params);
        assertThat(client().verifyWebhook(URL, TS, params, good)).isTrue();

        // Any tamper (wrong sig, changed value, missing timestamp) must fail.
        assertThat(client().verifyWebhook(URL, TS, params, good + "00")).isFalse();
        assertThat(client().verifyWebhook(URL, TS, params, "deadbeef")).isFalse();
        Map<String, String> tampered = new LinkedHashMap<>(params);
        tampered.put("status", "failed");
        assertThat(client().verifyWebhook(URL, TS, tampered, good)).isFalse();
        assertThat(client().verifyWebhook(URL, null, params, good)).isFalse();
    }

    @Test
    void verifyWebhook_blankSecret_failsClosed() {
        RelworxProperties p = new RelworxProperties();   // no webhook secret
        RelworxClient c = new RelworxClient(p);
        assertThat(c.verifyWebhook(URL, TS, Map.of("status", "success"), "anything")).isFalse();
    }
}
