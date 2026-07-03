package com.gridclan.controller;

import com.gridclan.service.AccountDeletionService;
import com.gridclan.service.DataExportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Account lifecycle endpoints.
 *
 * /user/delete-account  — Google Play requires in-app deletion; no email-only flow.
 * /user/cancel-deletion — 24h appeal window. Public endpoint (user is already logged out).
 * /user/data-export     — GDPR / Uganda DPA right of access & portability.
 */
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class AccountController {

    private final AccountDeletionService deletionService;
    private final DataExportService      exportService;

    /**
     * GET /user/data-export
     * Everything we hold about the caller as machine-readable JSON
     * (the path is named in the privacy policy — keep them in sync).
     */
    @GetMapping("/data-export")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, Object>> exportData(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"gridclan-data-export.json\"")
            .body(exportService.exportUserData(userId));
    }

    /**
     * POST /user/delete-account
     * Immediate phase: deactivates account, invalidates JWT, schedules erasure.
     * Phase 2 erasure runs within 30 days (nightly at 03:00 EAT).
     */
    @PostMapping("/delete-account")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Map<String, String>> requestDeletion(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        deletionService.requestDeletion(userId);
        return ResponseEntity.ok(Map.of(
            "status",  "DELETION_SCHEDULED",
            "message", "Your personal data will be erased within 30 days. " +
                       "Anonymised transaction records are retained per Ugandan financial law.",
            "note",    "You have been logged out. Use the tombstone ID emailed to you " +
                       "to cancel within 24 hours."
        ));
    }

    /**
     * DELETE /user/cancel-deletion?tombstoneId=UUID
     * No JWT required — user is already logged out at this point.
     * Tombstone UUID is the proof of identity within the appeal window.
     */
    @DeleteMapping("/cancel-deletion")
    public ResponseEntity<Map<String, String>> cancelDeletion(
            @RequestParam String tombstoneId) {
        deletionService.cancelDeletion(UUID.fromString(tombstoneId));
        return ResponseEntity.ok(Map.of(
            "status",  "DELETION_CANCELLED",
            "message", "Your account deletion has been successfully cancelled. Please log in again."
        ));
    }
}
