package com.gridclan.security;

import com.gridclan.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * JWT authentication filter.
 *
 * Order of operations:
 *   1. Extract Bearer token from Authorization header
 *   2. Validate signature + expiry via JwtService
 *   3. Block immediately if account is pending deletion (even valid JWT)
 *   4. Populate SecurityContext with userId + role
 *
 * Runs AFTER RateLimitFilter (Order 1).
 */
@Component
@Order(2)
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService     jwtService;
    private final UserService    userService;

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain)
            throws ServletException, IOException {

        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(req, res);
            return;
        }

        try {
            Claims claims = jwtService.validateAndParse(header.substring(7));
            UUID userId   = UUID.fromString(claims.getSubject());

            // ── Token revocation — reject tokens from a past session epoch ─
            // Bumped on logout / password reset, so a stolen or stale access
            // token stops working immediately even before it expires. Missing
            // claim (pre-feature tokens) → 0, the default version.
            Object tvClaim = claims.get("tv");
            int tokenVersion = tvClaim instanceof Number n ? n.intValue() : 0;
            if (!userService.isTokenVersionCurrent(userId, tokenVersion)) {
                writeJson(res, 401, "{\"error\":\"Token revoked\"}");
                return;
            }

            // ── HARD BLOCK — account pending deletion cannot act ─────────
            if (userService.isPendingDeletion(userId)) {
                writeJson(res, 403, "{\"error\":\"Account pending deletion\"}");
                return;
            }

            // ── Also block suspended accounts ────────────────────────────
            if (userService.isSuspended(userId)) {
                writeJson(res, 403, "{\"error\":\"Account suspended\"}");
                return;
            }

            String role = (String) claims.get("role");
            UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                    userId, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))
                );
            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (JwtException e) {
            writeJson(res, 401, "{\"error\":\"Invalid or expired token\"}");
            return;
        }

        chain.doFilter(req, res);
    }

    private void writeJson(HttpServletResponse res, int status, String body) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write(body);
    }
}
