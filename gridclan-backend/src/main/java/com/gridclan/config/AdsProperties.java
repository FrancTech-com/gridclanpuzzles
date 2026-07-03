package com.gridclan.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Ad-reward system config ({@code gridclan.ads}). Watching ads is the earning
 * mechanism that funds player payouts — every completed ad credits
 * {@link #rewardAmount} {@link #rewardCurrency} to the player's wallet
 * (the UI shows the balance as reward points).
 *
 * THREE ad networks are configured, each with its own ROLE in an ordered
 * failover chain (primary → secondary → tertiary): if one network fails to
 * load an ad, the next takes over, so a single provider outage never breaks
 * the app. Keys live ONLY in env (gridclan-backend/.env):
 *   AD_PROVIDER_{1,2,3}_ID / _NAME / _APP_KEY
 *
 * With no provider configured the system reports configured=false and the app
 * shows a clear "ads unavailable" state instead of a broken ad — the same
 * pattern as the Relworx keys. {@link #testMode} lets the built-in placeholder
 * ad play (and credit) during development ONLY; never enable it in production.
 */
@Component
@ConfigurationProperties(prefix = "gridclan.ads")
@Getter @Setter
public class AdsProperties {

    /** The failover chain, in priority order (index 0 = primary). */
    private List<Provider> providers = new ArrayList<>();

    /** Money credited to the wallet per completed ad. Displayed to players as
     *  reward points at 1 point = UGX 0.2 (UGX 1.00 → "5 points"). Keep at or
     *  below ~30% of measured revenue per completed ad. */
    private BigDecimal rewardAmount = new BigDecimal("1.00");
    private String rewardCurrency = "UGX";

    /** Max credited ads per ACCOUNT per rolling 24h — caps the payout faucet. */
    private int dailyLimit = 30;

    /** Max credited ads per DEVICE per rolling 24h, across all accounts.
     *  Deliberately HIGHER than the account cap: a single player never feels
     *  it, and a shared family phone gets allowance for 2 accounts — but a
     *  ten-account farm on one phone still hits this wall. */
    private int deviceDailyLimit = 60;

    /** Minutes an ISSUED session stays creditable before it expires. */
    private int sessionExpiryMinutes = 30;

    /** Seconds a session must be old before it may credit — a real rewarded
     *  ad runs 15–30s, so completions faster than this are bots/scripts. */
    private int minWatchSeconds = 10;

    /** DEV ONLY: allow the placeholder ad to play + credit with no real network. */
    private boolean testMode = false;

    /** Ads can pay out when at least one real network is wired (or in dev). */
    public boolean isConfigured() {
        return testMode || providers.stream().anyMatch(Provider::isUsable);
    }

    /** The usable providers in failover order (what the client will try). */
    public List<Provider> activeProviders() {
        return providers.stream().filter(Provider::isUsable).toList();
    }

    @Getter @Setter
    public static class Provider {
        /** Stable id the client's adapter registry matches on (e.g. "admob"). */
        private String id;
        /** Display name (e.g. "AdMob"). */
        private String name;
        /** Role in the chain: PRIMARY / SECONDARY / TERTIARY (priority order). */
        private String role;
        /** The network's app/SDK key — from env; blank = provider disabled. */
        private String appKey;
        private boolean enabled = true;

        boolean isUsable() {
            return enabled && id != null && !id.isBlank()
                && appKey != null && !appKey.isBlank();
        }
    }
}
