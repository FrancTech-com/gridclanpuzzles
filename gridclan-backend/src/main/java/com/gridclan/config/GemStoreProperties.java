package com.gridclan.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Buyable gem packs, configured in application.yml under {@code gridclan.gems.store}.
 *
 * Each pack grants a fixed number of gems and carries a CLEAN per-currency price
 * (no FX maths — you set a tidy local amount for each currency you support). The
 * currency a player is charged in is derived from their mobile-money phone number,
 * and the matching price is looked up here. A pack with no price for the player's
 * currency simply isn't offered to them.
 *
 * Adding a currency = adding one line under a pack's {@code prices}. Editing prices
 * needs no code change (config only).
 */
@Component
@ConfigurationProperties(prefix = "gridclan.gems.store")
@Getter @Setter
public class GemStoreProperties {

    private List<Pack> packs = new ArrayList<>();

    /** The pack with this id, or null. */
    public Pack pack(String id) {
        return packs.stream().filter(p -> p.getId().equals(id)).findFirst().orElse(null);
    }

    @Getter @Setter
    public static class Pack {
        /** Stable id used by the client + stored on the purchase (e.g. "popular"). */
        private String id;
        /** Optional display label (e.g. "Most popular"). */
        private String label;
        /** Gems granted on a successful purchase. */
        private long gems;
        /** Months of post-game popup-ad freedom the pack also buys (0 = none). */
        private int adFreeMonths;
        /** Currency code (UGX, KES, …) → price in that currency's normal unit. */
        private Map<String, BigDecimal> prices = new LinkedHashMap<>();

        public BigDecimal priceFor(String currency) {
            return prices.get(currency);
        }
    }
}
