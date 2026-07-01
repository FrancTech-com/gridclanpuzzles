package com.gridclan.service;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps a mobile-money phone number to the currency it pays in, from its country
 * dialing code. This is the "who is playing" signal for pricing: the player pays
 * with their own mobile-money line, so its country sets the charge currency.
 *
 * Only currencies your Relworx account actually supports need a real price in the
 * gem-store config; this map just needs to cover the phone countries you accept.
 * Add a country = add one line below.
 */
@Component
public class PhoneCurrencyResolver {

    // Country dialing code (no '+') → ISO currency. Longer codes are checked first
    // so e.g. "256" (Uganda) wins before any 2-digit code.
    private static final Map<String, String> CODE_TO_CURRENCY = new LinkedHashMap<>();
    static {
        CODE_TO_CURRENCY.put("256", "UGX"); // Uganda
        CODE_TO_CURRENCY.put("254", "KES"); // Kenya
        CODE_TO_CURRENCY.put("255", "TZS"); // Tanzania
        CODE_TO_CURRENCY.put("250", "RWF"); // Rwanda
        CODE_TO_CURRENCY.put("257", "BIF"); // Burundi
        CODE_TO_CURRENCY.put("260", "ZMW"); // Zambia
        CODE_TO_CURRENCY.put("233", "GHS"); // Ghana
        CODE_TO_CURRENCY.put("234", "NGN"); // Nigeria
        CODE_TO_CURRENCY.put("27",  "ZAR"); // South Africa
    }

    /**
     * Currency for an E.164-style number ("+2567..." / "2567..."), or null if the
     * country isn't recognised. Strips spaces, dashes and a leading '+'.
     */
    public String currencyFor(String msisdn) {
        if (msisdn == null) return null;
        String digits = msisdn.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return null;
        // Check 3-digit codes before 2-digit so the most specific wins.
        for (int len = 3; len >= 2; len--) {
            if (digits.length() < len) continue;
            String prefix = digits.substring(0, len);
            String cur = CODE_TO_CURRENCY.get(prefix);
            if (cur != null) return cur;
        }
        return null;
    }

    /** Normalise a number to E.164 ("+<digits>"), or null if it has no digits. */
    public String normalise(String msisdn) {
        if (msisdn == null) return null;
        String digits = msisdn.replaceAll("[^0-9]", "");
        return digits.isEmpty() ? null : "+" + digits;
    }
}
