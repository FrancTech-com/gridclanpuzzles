package com.gridclan.service;

import com.gridclan.dto.SessionStartResponse;
import com.gridclan.entity.ActiveSession;
import com.gridclan.entity.Challenge;
import com.gridclan.entity.enums.GameType;
import com.gridclan.entity.enums.SessionStatus;
import com.gridclan.repository.ActiveSessionRepository;
import com.gridclan.repository.ChallengeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Async friend challenges. The creator and one opponent each solve the SAME
 * server-generated board; whoever's authoritative server score is higher wins.
 *
 * Scores are reconciled lazily: whenever a challenge is fetched, any finished
 * session has its (server-authoritative) score copied onto the challenge. This
 * keeps the core game loop untouched and means the client can never report its
 * own score.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChallengeService {

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int    CODE_LENGTH   = 6;
    private static final Duration TTL         = Duration.ofDays(7);
    private static final SecureRandom RANDOM  = new SecureRandom();

    private final ChallengeRepository    challengeRepo;
    private final ActiveSessionRepository sessionRepo;
    private final GameBoardGenerator     boardGenerator;
    private final GameSessionService     sessionService;

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> create(UUID userId, GameType gameType) {
        Map<String, Object> board = boardGenerator.generate(gameType);

        // Start the creator's session on this board first so we can record its id.
        SessionStartResponse session = sessionService.startWithBoard(userId, gameType, board);

        Challenge challenge = Challenge.builder()
            .code(uniqueCode())
            .gameType(gameType)
            .boardState(board)
            .creatorId(userId)
            .creatorSessionId(session.getSessionId())
            .status("PENDING")
            .createdAt(Instant.now())
            .expiresAt(Instant.now().plus(TTL))
            .build();
        challengeRepo.save(challenge);

        log.info("Challenge created: code={} creator={} type={}", challenge.getCode(), userId, gameType);
        return Map.of(
            "code",      challenge.getCode(),
            "sessionId", session.getSessionId(),
            "gameType",  gameType
        );
    }

    // ── Accept ─────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> accept(UUID userId, String code) {
        Challenge c = require(code);

        if (Instant.now().isAfter(c.getExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.GONE, "This challenge has expired.");
        }
        if (c.getCreatorId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You created this challenge — share the code with a friend.");
        }
        if (c.getOpponentId() != null && !c.getOpponentId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This challenge already has an opponent.");
        }

        // Idempotent: if this user already joined, return their existing session.
        if (c.getOpponentId() == null) {
            SessionStartResponse session =
                sessionService.startWithBoard(userId, c.getGameType(), c.getBoardState());
            c.setOpponentId(userId);
            c.setOpponentSessionId(session.getSessionId());
            challengeRepo.save(c);
            log.info("Challenge accepted: code={} opponent={}", code, userId);
            return Map.of("sessionId", session.getSessionId(), "gameType", c.getGameType());
        }
        return Map.of("sessionId", c.getOpponentSessionId(), "gameType", c.getGameType());
    }

    // ── View (reconciles scores) ────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> view(UUID userId, String code) {
        Challenge c = reconcile(require(code));

        boolean isCreator  = c.getCreatorId().equals(userId);
        boolean isOpponent = userId.equals(c.getOpponentId());
        Integer yourScore  = isCreator ? c.getCreatorScore()  : isOpponent ? c.getOpponentScore()  : null;
        Integer theirScore = isCreator ? c.getOpponentScore() : isOpponent ? c.getCreatorScore()   : null;

        // The session this user still needs to play (null once they've finished).
        UUID yourSessionId = null;
        if (isCreator && c.getCreatorScore() == null)   yourSessionId = c.getCreatorSessionId();
        if (isOpponent && c.getOpponentScore() == null) yourSessionId = c.getOpponentSessionId();

        String role = isCreator ? "CREATOR" : isOpponent ? "OPPONENT" : "VIEWER";

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code",          c.getCode());
        out.put("gameType",      c.getGameType());
        out.put("status",        c.getStatus());
        out.put("role",          role);
        out.put("hasOpponent",   c.getOpponentId() != null);
        out.put("yourScore",     yourScore);
        out.put("theirScore",    theirScore);
        out.put("yourSessionId", yourSessionId);
        out.put("expiresAt",     c.getExpiresAt());
        if ("COMPLETE".equals(c.getStatus()) && yourScore != null && theirScore != null) {
            out.put("outcome", yourScore > theirScore ? "WON" : yourScore < theirScore ? "LOST" : "TIE");
        }
        return out;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** Copy finished sessions' authoritative scores onto the challenge. */
    private Challenge reconcile(Challenge c) {
        boolean changed = false;
        if (c.getCreatorScore() == null) {
            Integer s = finishedScore(c.getCreatorSessionId(), c.getCreatorId());
            if (s != null) { c.setCreatorScore(s); changed = true; }
        }
        if (c.getOpponentScore() == null && c.getOpponentId() != null) {
            Integer s = finishedScore(c.getOpponentSessionId(), c.getOpponentId());
            if (s != null) { c.setOpponentScore(s); changed = true; }
        }
        if (!"COMPLETE".equals(c.getStatus())
                && c.getCreatorScore() != null && c.getOpponentScore() != null) {
            c.setStatus("COMPLETE");
            changed = true;
        }
        if (changed) challengeRepo.save(c);
        return c;
    }

    /** A session's score once it is COMPLETED, else null (still in progress). */
    private Integer finishedScore(UUID sessionId, UUID userId) {
        if (sessionId == null) return null;
        return sessionRepo.findByIdAndUserId(sessionId, userId)
            .filter(s -> s.getStatus() == SessionStatus.COMPLETED)
            .map(ActiveSession::getServerScore)
            .orElse(null);
    }

    private Challenge require(String code) {
        return challengeRepo.findByCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Challenge not found."));
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
            }
            String code = sb.toString();
            if (!challengeRepo.existsByCode(code)) return code;
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not allocate a challenge code.");
    }
}
