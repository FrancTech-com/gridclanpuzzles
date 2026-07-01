package com.gridclan.config;

import com.gridclan.security.JwtAuthFilter;
import com.gridclan.security.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.expression.method.MethodSecurityExpressionHandler;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final RateLimitFilter rateLimitFilter;
    private final JwtAuthFilter   jwtAuthFilter;

    /**
     * Role hierarchy: an ADMIN is also a USER. Without this, accounts whose JWT
     * carries only ROLE_ADMIN fail every @PreAuthorize("hasRole('USER')") check
     * (profile, gems, points, sessions, …) — so an admin could not load their
     * own profile. ADMIN now implies USER everywhere (web + method security).
     */
    @Bean
    static RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.fromHierarchy("ROLE_ADMIN > ROLE_USER");
    }

    /** Wire the hierarchy into @PreAuthorize/@PostAuthorize evaluation. */
    @Bean
    static MethodSecurityExpressionHandler methodSecurityExpressionHandler(RoleHierarchy roleHierarchy) {
        DefaultMethodSecurityExpressionHandler handler = new DefaultMethodSecurityExpressionHandler();
        handler.setRoleHierarchy(roleHierarchy);
        return handler;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())           // JWT-based API; no CSRF needed
            .sessionManagement(sm -> sm
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .cors(cors -> cors.configurationSource(corsSource()))
            .authorizeHttpRequests(auth -> auth
                // Public endpoints
                .requestMatchers("/auth/**").permitAll()
                .requestMatchers("/user/cancel-deletion").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/ws/**").permitAll()              // WS upgrade (JWT in handshake)
                // Ops: error-report is public so the app can report crashes before auth
                // health is public for external uptime monitors
                .requestMatchers("/ops/error-report").permitAll()
                .requestMatchers("/ops/health").permitAll()
                // Relworx payment webhook posts with no JWT; verified by signature.
                .requestMatchers("/payments/relworx/webhook").permitAll()
                // Legal documents must be public before login (blueprint:
                // "privacy policy accessible at a public URL before app launch")
                .requestMatchers("/legal/**").permitAll()
                // Global leaderboard is public so the guest-browsable home can
                // show the top-players panel (display name + score only, no PII)
                .requestMatchers("/leaderboard/**").permitAll()
                // Admin dashboard page (static HTML) loads anonymously; it logs in
                // via /auth/login and every /admin/** API stays ADMIN-only.
                .requestMatchers("/admin.html").permitAll()
                // Everything else requires authentication
                .anyRequest().authenticated()
            )
            // Rate limit fires first (Order 1), then JWT (Order 2)
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(jwtAuthFilter, RateLimitFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        // Allowed browser origins. Native iOS/Android apps send no Origin header
        // so CORS does not apply to them; this list is the web surface only:
        //   - the GridClan Puzzles web app on Netlify (gridclanpuzzle.win)
        //   - the backend host itself — the admin dashboard (/admin.html) is
        //     served from api.gridclanpuzzle.win, and browsers attach that
        //     Origin to its POST /auth/login, so it must be allowed or the
        //     admin page can't log in (was rejected with 403).
        //   - localhost during web development (any port).
        cfg.setAllowedOriginPatterns(List.of(
            "https://gridclanpuzzle.win",
            "https://www.gridclanpuzzle.win",
            "https://api.gridclanpuzzle.win",
            "http://localhost:*"));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of(
            "Authorization", "Content-Type", "X-Client-Version"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
