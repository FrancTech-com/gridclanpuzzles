package com.gridclan.service;

import com.gridclan.entity.User;
import com.gridclan.exception.UserNotFoundException;
import com.gridclan.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Personal-data export (GDPR Art. 20 / Uganda DPA 2019 right of access &
 * portability). Assembles everything we hold about one user into a single
 * JSON-serialisable map: profile, consents, points, gems, wallet, purchases,
 * redemptions and ad-reward history.
 *
 * Fields are picked explicitly — never whole entities — so secrets
 * (password hash, refresh-token hash, device tokens) can't leak into the file.
 */
@Service
@RequiredArgsConstructor
public class DataExportService {

    private final UserRepository              userRepo;
    private final PlayerPointsRepository      pointsRepo;
    private final LedgerTransactionRepository ledgerRepo;
    private final PlayerGemsRepository        gemsRepo;
    private final GemTransactionRepository    gemTxRepo;
    private final PlayerWalletRepository      walletRepo;
    private final WalletTransactionRepository walletTxRepo;
    private final WithdrawalRepository        withdrawalRepo;
    private final GemPurchaseRepository       gemPurchaseRepo;
    private final AdSessionRepository         adSessionRepo;
    private final AuditLogService             audit;

    private static final int MAX_ROWS = 5000;

    @Transactional(readOnly = true)
    public Map<String, Object> exportUserData(UUID userId) {
        User user = userRepo.findById(userId).orElseThrow(UserNotFoundException::new);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exportedAt", java.time.Instant.now().toString());
        out.put("format", "GridClan Puzzles personal data export v1");

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("userId",        user.getId());
        profile.put("username",      user.getUsername());
        profile.put("email",         user.getEmail());
        profile.put("phoneNumber",   user.getPhoneNumber());
        profile.put("displayName",   user.getDisplayName());
        profile.put("countryCode",   user.getCountryCode());
        profile.put("role",          user.getRole());
        profile.put("createdAt",     user.getCreatedAt());
        profile.put("lastLoginAt",   user.getLastLoginAt());
        out.put("profile", profile);

        Map<String, Object> consents = new LinkedHashMap<>();
        consents.put("termsAcceptedAt",    user.getTermsAcceptedAt());
        consents.put("marketingConsent",   user.isMarketingConsent());
        consents.put("marketingConsentAt", user.getMarketingConsentAt());
        consents.put("personalisedAds",    user.isAdsPersonalized());
        consents.put("ageVerified",        user.isAgeVerified());
        consents.put("isAdult",            user.getIsAdult());
        out.put("consents", consents);

        pointsRepo.findByUserId(userId).ifPresent(p -> out.put("points", Map.of(
            "balance",        p.getBalance(),
            "lifetimeEarned", p.getLifetimeEarned(),
            "lifetimeSpent",  p.getLifetimeSpent())));
        out.put("pointsHistory", ledgerRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .limit(MAX_ROWS)
            .map(t -> mapOf("type", t.getType(), "pointsDelta", t.getPointsDelta(),
                "balanceAfter", t.getBalanceAfter(), "status", t.getStatus(),
                "createdAt", t.getCreatedAt()))
            .toList());

        gemsRepo.findByUserId(userId).ifPresent(g -> out.put("gems", Map.of(
            "balance",          g.getBalance(),
            "lifetimeEarned",   g.getLifetimeEarned(),
            "lifetimeGifted",   g.getLifetimeGifted(),
            "lifetimeReceived", g.getLifetimeReceived(),
            "lifetimeSpent",    g.getLifetimeSpent())));
        out.put("gemHistory", gemTxRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .limit(MAX_ROWS)
            .map(t -> mapOf("type", t.getType(), "gemsDelta", t.getGemsDelta(),
                "balanceAfter", t.getBalanceAfter(), "note", t.getNote(),
                "createdAt", t.getCreatedAt()))
            .toList());

        out.put("rewardWallets", walletRepo.findByUserId(userId).stream()
            .map(w -> mapOf("currency", w.getCurrency(), "balance", w.getBalance(),
                "lifetimeEarned", w.getLifetimeEarned(),
                "lifetimeRedeemed", w.getLifetimeWithdrawn()))
            .toList());
        out.put("walletHistory", walletTxRepo
            .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, MAX_ROWS)).stream()
            .map(t -> mapOf("type", t.getType(), "currency", t.getCurrency(),
                "amountDelta", t.getAmountDelta(), "balanceAfter", t.getBalanceAfter(),
                "note", t.getNote(), "createdAt", t.getCreatedAt()))
            .toList());
        out.put("redemptions", withdrawalRepo
            .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, MAX_ROWS)).stream()
            .map(w -> mapOf("reference", w.getReference(), "msisdn", w.getMsisdn(),
                "currency", w.getCurrency(), "amount", w.getAmount(),
                "status", w.getStatus(), "failureReason", w.getFailureReason(),
                "createdAt", w.getCreatedAt()))
            .toList());
        out.put("gemPurchases", gemPurchaseRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .limit(MAX_ROWS)
            .map(p -> mapOf("reference", p.getReference(), "packId", p.getPackId(),
                "gems", p.getGems(), "currency", p.getCurrency(), "amount", p.getAmount(),
                "method", p.getMethod(), "msisdn", p.getMsisdn(), "status", p.getStatus(),
                "createdAt", p.getCreatedAt()))
            .toList());
        out.put("adRewardSessions", adSessionRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .limit(MAX_ROWS)
            .map(s -> mapOf("placement", s.getPlacement(), "provider", s.getProvider(),
                "status", s.getStatus(), "rewardAmount", s.getRewardAmount(),
                "currency", s.getCurrency(), "createdAt", s.getCreatedAt(),
                "completedAt", s.getCompletedAt()))
            .toList());

        audit.record(userId, "DATA_EXPORTED", "self-service export");
        return out;
    }

    /** Map.of rejects null values; export rows legitimately contain nulls. */
    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
