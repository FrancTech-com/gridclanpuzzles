package com.gridclan.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * HS256 JWTs with kid-versioned keys (blueprint § Authentication).
 *
 * Signing always uses the active kid; verification resolves the key from
 * the token's own kid header, so previously issued tokens keep working
 * through a monthly rotation window. Tokens minted before kid versioning
 * carry no kid and fall back to v1.
 */
@Service
public class JwtService {

    private static final String LEGACY_KID = "v1";

    private final Map<String, SecretKey> keysByKid = new HashMap<>();
    private final String activeKid;
    private final long accessExpiryMs;
    private final long refreshExpiryMs;

    public JwtService(
            JwtKeyProperties keyProps,
            @Value("${gridclan.jwt.access-token-expiry-minutes}") long accessMinutes,
            @Value("${gridclan.jwt.refresh-token-expiry-days}") long refreshDays) {

        keyProps.getKeys().forEach((kid, secret) -> {
            if (secret != null && !secret.isBlank()) {
                keysByKid.put(kid, Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)));
            }
        });
        // Legacy single-secret config doubles as v1.
        if (!keysByKid.containsKey(LEGACY_KID)
                && keyProps.getSecret() != null && !keyProps.getSecret().isBlank()) {
            keysByKid.put(LEGACY_KID,
                Keys.hmacShaKeyFor(keyProps.getSecret().getBytes(StandardCharsets.UTF_8)));
        }

        this.activeKid = keyProps.getActiveKid();
        if (!keysByKid.containsKey(activeKid)) {
            throw new IllegalStateException(
                "JWT active kid '" + activeKid + "' has no configured key");
        }
        this.accessExpiryMs  = accessMinutes * 60 * 1000;
        this.refreshExpiryMs = refreshDays * 24 * 60 * 60 * 1000;
    }

    public String generateAccessToken(UUID userId, String role, int tokenVersion) {
        return Jwts.builder()
            .header().keyId(activeKid).and()
            .subject(userId.toString())
            .claim("role", role)
            .claim("type", "ACCESS")
            .claim("tv", tokenVersion)   // session epoch — see JwtAuthFilter revocation check
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plusMillis(accessExpiryMs)))
            .signWith(keysByKid.get(activeKid))
            .compact();
    }

    public String generateRefreshToken(UUID userId) {
        return Jwts.builder()
            .header().keyId(activeKid).and()
            .subject(userId.toString())
            .claim("type", "REFRESH")
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plusMillis(refreshExpiryMs)))
            .signWith(keysByKid.get(activeKid))
            .compact();
    }

    /**
     * Validates signature + expiry, resolving the key from the token's kid
     * header. Throws JwtException on failure (including unknown kid).
     */
    public Claims validateAndParse(String token) {
        return Jwts.parser()
            .keyLocator(this::locateKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    private Key locateKey(io.jsonwebtoken.Header header) {
        String kid = (header instanceof ProtectedHeader ph) ? ph.getKeyId() : null;
        return keysByKid.get(kid == null ? LEGACY_KID : kid);  // null → JwtException
    }
}
