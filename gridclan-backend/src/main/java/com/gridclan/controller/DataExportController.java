package com.gridclan.controller;

import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.repository.*;
import com.gridclan.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * GDPR Art. 15 (right to access) + Art. 20 (right to portability).
 * Also satisfies the equivalent rights under Uganda DPA 2019, LGPD, CCPA,
 * PDPA, APP — one machine-readable JSON export covers all of them.
 *
 * Returns every piece of personal data GridClan holds about the caller:
 *   - account profile
 *   - points balance
 *   - financial ledger (their own, non-anonymised rows)
 *   - completed game sessions
 *
 * Response is delivered immediately, well within the stricter of the
 * GDPR 30-day / Uganda 21-day windows.
 */
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class DataExportController {

    private final UserRepository              userRepo;
    private final PlayerPointsRepository      pointsRepo;
    private final LedgerTransactionRepository ledgerRepo;
    private final PlayerGemsRepository        gemsRepo;
    private final GemTransactionRepository    gemTxRepo;
    private final ActiveSessionRepository     sessionRepo;
    private final AuditLogService             audit;

    @GetMapping("/data-export")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> exportMyData(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();

        return userRepo.findById(userId).map(u -> {
            Map<String, Object> account = new LinkedHashMap<>();
            account.put("userId",            u.getId());
            account.put("username",          u.getUsername());
            account.put("email",             u.getEmail());
            account.put("emailVerified",     u.isEmailVerified());
            account.put("phoneNumber",       u.getPhoneNumber());
            account.put("displayName",       u.getDisplayName());
            account.put("avatarUrl",         u.getAvatarUrl());
            account.put("countryCode",       u.getCountryCode());
            account.put("role",              u.getRole());
            account.put("marketingConsent",  u.isMarketingConsent());
            account.put("marketingConsentAt", str(u.getMarketingConsentAt()));
            account.put("ageVerified",       u.isAgeVerified());
            account.put("doNotSell",         u.isDoNotSell());
            account.put("doNotSellAt",       str(u.getDoNotSellAt()));
            account.put("createdAt",         str(u.getCreatedAt()));
            account.put("lastLoginAt",       str(u.getLastLoginAt()));
            account.put("lastActiveAt",      str(u.getLastActiveAt()));

            long balance = pointsRepo.findByUserId(userId)
                .map(p -> p.getBalance()).orElse(0L);

            long gemBalance = gemsRepo.findByUserId(userId)
                .map(g -> g.getBalance()).orElse(0L);

            List<Map<String, Object>> gemTransactions = gemTxRepo
                .findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id",             t.getId());
                    m.put("type",           t.getType());
                    m.put("gemsDelta",      t.getGemsDelta());
                    m.put("balanceAfter",   t.getBalanceAfter());
                    m.put("counterpartyId", t.getCounterpartyId());
                    m.put("note",           t.getNote());
                    m.put("createdAt",      str(t.getCreatedAt()));
                    return m;
                })
                .toList();

            List<Map<String, Object>> transactions = ledgerRepo
                .findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id",            t.getId());
                    m.put("type",          t.getType());
                    m.put("pointsDelta",   t.getPointsDelta());
                    m.put("balanceAfter",  t.getBalanceAfter());
                    m.put("status",        t.getStatus());
                    m.put("createdAt",     str(t.getCreatedAt()));
                    return m;
                })
                .toList();

            List<Map<String, Object>> sessions = sessionRepo
                .findByUserIdAndStatus(userId, SessionStatus.COMPLETED).stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("sessionId",   s.getId());
                    m.put("gameType",    s.getGameType());
                    m.put("tier",        s.getTier());
                    m.put("score",       s.getServerScore());
                    m.put("moves",       s.getMoveCount());
                    m.put("startedAt",   str(s.getStartedAt()));
                    m.put("completedAt", str(s.getCompletedAt()));
                    return m;
                })
                .toList();

            audit.record(userId, "DATA_EXPORT", "GDPR Art.15/20 export delivered");

            Map<String, Object> export = new LinkedHashMap<>();
            export.put("generatedAt",  Instant.now().toString());
            export.put("legalBasis",   "GDPR Art. 15/20; Uganda DPA 2019; LGPD; CCPA");
            export.put("account",      account);
            export.put("pointsBalance", balance);
            export.put("pointsLedger", transactions);
            export.put("gemBalance",   gemBalance);
            export.put("gemTransactions", gemTransactions);
            export.put("gameSessions", sessions);

            return ResponseEntity.ok(export);
        }).orElse(ResponseEntity.notFound().build());
    }

    private static String str(Instant i) { return i != null ? i.toString() : null; }
}
