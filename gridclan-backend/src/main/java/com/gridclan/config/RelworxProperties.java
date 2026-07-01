package com.gridclan.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Relworx (Ugandan mobile-money aggregator) credentials + endpoint.
 *
 * SECRETS LIVE ONLY IN ENV (gridclan-backend/.env), never in source:
 *   RELWORX_API_KEY         — secret API key (Bearer token)
 *   RELWORX_ACCOUNT_NO      — your merchant account number
 *   RELWORX_WEBHOOK_SECRET  — used to verify inbound payment webhooks
 *
 * When {@link #apiKey} is blank the gem store is treated as not-configured and
 * purchase endpoints return a clear error instead of calling Relworx — so the
 * app runs fine before the keys are added.
 */
@Component
@ConfigurationProperties(prefix = "gridclan.relworx")
@Getter @Setter
public class RelworxProperties {

    /** Relworx API base, e.g. https://payments.relworx.com/api (no trailing slash). */
    private String baseUrl = "https://payments.relworx.com/api";

    private String apiKey;
    private String accountNo;

    /** Webhook signing key ("webhook_key") from the Relworx dashboard — NOT the API key. */
    private String webhookSecret;

    /**
     * The exact public webhook URL registered in the Relworx dashboard. It is part
     * of the signed string, so it must match byte-for-byte what Relworx signs.
     */
    private String webhookUrl = "https://api.gridclanpuzzle.win/payments/relworx/webhook";

    /** Inbound header names Relworx uses (confirm/adjust from a real webhook). */
    private String signatureHeader = "Relworx-Signature";
    private String timestampHeader = "Relworx-Timestamp";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank()
            && accountNo != null && !accountNo.isBlank();
    }
}
