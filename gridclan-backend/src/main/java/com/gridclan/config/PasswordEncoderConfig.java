package com.gridclan.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * Provides a shared BCryptPasswordEncoder bean.
 * Cost factor 12 — tuned for ~250ms hashing on commodity hardware.
 * Both AuthController and UserSuspensionService inject this bean.
 */
@Configuration
public class PasswordEncoderConfig {

    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
