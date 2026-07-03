package com.gridclan.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Prize-wallet withdrawal rules, configured under {@code gridclan.wallet}.
 *
 * Limits are per currency (clean local amounts, no FX maths — same philosophy as
 * the gem store). A currency with no min entry falls back to {@code defaultMin};
 * no max entry means no per-withdrawal cap. Editing limits needs no code change.
 */
@Component
@ConfigurationProperties(prefix = "gridclan.wallet")
@Getter @Setter
public class WalletProperties {

    /** Currency code → smallest withdrawable amount in that currency. */
    private Map<String, BigDecimal> minWithdraw = new LinkedHashMap<>();

    /** Currency code → largest single withdrawal in that currency (absent = none). */
    private Map<String, BigDecimal> maxWithdraw = new LinkedHashMap<>();

    /** Floor used for currencies with no explicit min entry. */
    private BigDecimal defaultMin = BigDecimal.ONE;

    /** One-time credit every player receives on joining (0 = disabled). */
    private BigDecimal welcomeBonus = new BigDecimal("500");
    private String welcomeCurrency = "UGX";

    public BigDecimal minFor(String currency) {
        return minWithdraw.getOrDefault(currency, defaultMin);
    }

    /** Per-withdrawal cap for the currency, or null when uncapped. */
    public BigDecimal maxFor(String currency) {
        return maxWithdraw.get(currency);
    }
}
