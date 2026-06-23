package com.gridclan.controller;

import com.gridclan.exception.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

/**
 * Global exception handler — converts all domain exceptions to
 * consistent JSON error envelopes: {status, error, message, timestamp}
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .findFirst().orElse("Validation failed");
        return body(400, "VALIDATION_ERROR", message);
    }

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(UserNotFoundException e) {
        return body(404, "NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(SessionNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleSessionNotFound(SessionNotFoundException e) {
        return body(404, "SESSION_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(AccountNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleAccountNotFound(AccountNotFoundException e) {
        return body(404, "ACCOUNT_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(InsufficientBalanceException.class)
    public ResponseEntity<Map<String, Object>> handleBalance(InsufficientBalanceException e) {
        return body(422, "INSUFFICIENT_BALANCE", e.getMessage());
    }

    @ExceptionHandler(CheatDetectedException.class)
    public ResponseEntity<Map<String, Object>> handleCheat(CheatDetectedException e) {
        log.warn("Cheat detected in request: {}", e.getMessage());
        return body(403, "CHEAT_DETECTED", e.getMessage());
    }

    @ExceptionHandler(HintsBlockedException.class)
    public ResponseEntity<Map<String, Object>> handleHints(HintsBlockedException e) {
        return body(403, "HINTS_BLOCKED", e.getMessage());
    }

    @ExceptionHandler(InvalidSessionStateException.class)
    public ResponseEntity<Map<String, Object>> handleSessionState(InvalidSessionStateException e) {
        return body(409, "INVALID_SESSION_STATE", e.getMessage());
    }

    @ExceptionHandler(DuplicateRewardException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicate(DuplicateRewardException e) {
        return body(409, "DUPLICATE_REWARD", e.getMessage());
    }

    @ExceptionHandler(DuplicateRequestException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicateRequest(DuplicateRequestException e) {
        return body(409, "CONFLICT", e.getMessage());
    }

    @ExceptionHandler(InsufficientGemsException.class)
    public ResponseEntity<Map<String, Object>> handleGems(InsufficientGemsException e) {
        return body(422, "INSUFFICIENT_GEMS", e.getMessage());
    }

    @ExceptionHandler(GiftLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handleGiftLimit(GiftLimitExceededException e) {
        return body(429, "GIFT_LIMIT_EXCEEDED", e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadArg(IllegalArgumentException e) {
        return body(400, "BAD_REQUEST", e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception e) {
        log.error("Unhandled exception: {}", e.getMessage(), e);
        return body(500, "INTERNAL_ERROR", "An unexpected error occurred.");
    }

    private ResponseEntity<Map<String, Object>> body(int status, String error, String message) {
        return ResponseEntity.status(status).body(Map.of(
            "status",    status,
            "error",     error,
            "message",   message,
            "timestamp", Instant.now().toEpochMilli()
        ));
    }
}
