package com.gridclan.security;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Kid-versioned JWT signing keys (blueprint § Authentication: HS256,
 * kid-versioned keys, monthly rotation).
 *
 * Rotation procedure (zero downtime, no forced logout):
 *   1. Stage next month's key:   JWT_SECRET_V2 (keys.v2)
 *   2. Flip the signer:          JWT_ACTIVE_KID=v2
 *   3. Keep the old key listed until its last refresh token expires
 *      (30 days), then remove it.
 *
 * Tokens carry their kid in the JWS header; validation looks the key up by
 * kid, so tokens signed last month keep validating during the overlap.
 */
@Component
@ConfigurationProperties(prefix = "gridclan.jwt")
@Getter @Setter
public class JwtKeyProperties {

    /** Legacy single secret — also serves as keys.v1 when no map is set. */
    private String secret;

    /** Kid used to SIGN new tokens. All listed keys remain valid for verification. */
    private String activeKid = "v1";

    /** kid → HS256 secret. Blank values (unset env vars) are ignored. */
    private Map<String, String> keys = new HashMap<>();
}
