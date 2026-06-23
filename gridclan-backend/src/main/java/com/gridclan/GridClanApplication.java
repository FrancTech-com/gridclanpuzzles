package com.gridclan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * GridClan — Authoritative Game Server
 * East African Markets (UGX / KES / TZS)
 * ETHELES
 */
@SpringBootApplication
@EnableScheduling
@EnableAsync
public class GridClanApplication {
    public static void main(String[] args) {
        SpringApplication.run(GridClanApplication.class, args);
    }
}
