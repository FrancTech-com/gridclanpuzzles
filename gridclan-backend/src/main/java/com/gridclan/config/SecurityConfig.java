package com.gridclan.config;

import com.gridclan.security.JwtAuthFilter;
import com.gridclan.security.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
                // Legal documents must be public before login (blueprint:
                // "privacy policy accessible at a public URL before app launch")
                .requestMatchers("/legal/**").permitAll()
                // Global leaderboard is public so the guest-browsable home can
                // show the top-players panel (display name + score only, no PII)
                .requestMatchers("/leaderboard/**").permitAll()
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
        //   - localhost during web development (any port).
        cfg.setAllowedOriginPatterns(List.of(
            "https://gridclanpuzzle.win",
            "https://www.gridclanpuzzle.win",
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
