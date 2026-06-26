package com.gridclan;

import com.gridclan.entity.User;
import com.gridclan.entity.PlayerPoints;
import com.gridclan.repository.PlayerPointsRepository;
import com.gridclan.repository.UserRepository;
import com.gridclan.security.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Spring Boot integration tests.
 * Uses application-test.yml — H2 in-memory DB, Flyway disabled.
 *
 * Tests cover the full HTTP stack: filter chain → controller → service → repo.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class IntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository userRepo;
    @Autowired PlayerPointsRepository pointsRepo;
    @Autowired JwtService jwtService;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    private UUID     userId;
    private String   accessToken;

    @BeforeEach
    void setUp() {
        User user = User.builder()
            .username("testplayer")
            .email("player@gridclanpuzzle.win")
            .phoneNumber("+256700000001")
            .passwordHash(encoder.encode("SecurePass123!"))
            .displayName("Test Player")
            .role("USER")
            .countryCode("UG")
            .isActive(true)
            .build();
        userRepo.save(user);
        userId = user.getId();

        pointsRepo.save(PlayerPoints.builder()
            .userId(userId).balance(5000L).build());

        accessToken = jwtService.generateAccessToken(userId, "USER", user.getTokenVersion());
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /auth/login — valid credentials returns 200 with tokens")
    void login_validCredentials_returns200() throws Exception {
        mvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "identifier", "player@gridclanpuzzle.win",
                    "password",   "SecurePass123!"
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.refreshToken").exists())
            .andExpect(jsonPath("$.role").value("USER"));
    }

    @Test
    @DisplayName("POST /auth/login — wrong password returns 401")
    void login_wrongPassword_returns401() throws Exception {
        mvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "identifier", "player@gridclanpuzzle.win",
                    "password",   "WrongPassword!"
                ))))
            .andExpect(status().isUnauthorized());
    }

    // ── JWT filter ────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /user/points/balance — no token returns 403")
    void balance_noToken_returns403() throws Exception {
        mvc.perform(get("/user/points/balance"))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /user/points/balance — valid token returns balance")
    void balance_validToken_returnsBalance() throws Exception {
        mvc.perform(get("/user/points/balance")
                .header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(5000));
    }

    @Test
    @DisplayName("GET /user/points/balance — expired/invalid token returns 401")
    void balance_invalidToken_returns401() throws Exception {
        mvc.perform(get("/user/points/balance")
                .header("Authorization", "Bearer invalid.jwt.token"))
            .andExpect(status().isUnauthorized());
    }

    // ── Session start ─────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /game/session/start — SOLO returns hintsAllowed=true")
    void startSession_solo_hintsAllowed() throws Exception {
        mvc.perform(post("/game/session/start")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "gameType", "WORD_SEARCH",
                    "tier",     "SOLO"
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hintsAllowed").value(true))
            .andExpect(jsonPath("$.sessionId").exists())
            .andExpect(jsonPath("$.initialBoard").exists());
    }

    @Test
    @DisplayName("POST /game/session/start — COMMUNITY_TOURNAMENT returns hintsAllowed=false")
    void startSession_tournament_hintsBlocked() throws Exception {
        mvc.perform(post("/game/session/start")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "gameType", "WORD_SEARCH",
                    "tier",     "COMMUNITY_TOURNAMENT"
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hintsAllowed").value(false));
    }

    // ── Hint endpoint ─────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /game/session/hint — tournament session returns 403 HINTS_BLOCKED")
    void hint_tournamentSession_returns403() throws Exception {
        // Start tournament session
        String startBody = mvc.perform(post("/game/session/start")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "gameType", "WORD_SEARCH",
                    "tier",     "COMMUNITY_TOURNAMENT"
                ))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String sessionId = mapper.readTree(startBody).get("sessionId").asText();

        mvc.perform(post("/game/session/hint")
                .header("Authorization", "Bearer " + accessToken)
                .param("sessionId", sessionId))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("HINTS_BLOCKED"));
    }

    // ── Account deletion ──────────────────────────────────────────────────

    @Test
    @DisplayName("POST /user/delete-account — marks deletion, deactivates account")
    void deleteAccount_marksForDeletion() throws Exception {
        mvc.perform(post("/user/delete-account")
                .header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DELETION_SCHEDULED"));

        User updated = userRepo.findById(userId).orElseThrow();
        Assertions.assertFalse(updated.isActive());
        Assertions.assertNotNull(updated.getDeletionRequestedAt());
        Assertions.assertNotNull(updated.getDeletionTombstoneId());
        Assertions.assertNull(updated.getRefreshTokenHash());
    }

    // ── Registration validation ───────────────────────────────────────────

    @Test
    @DisplayName("POST /auth/register — duplicate email returns 409")
    void register_duplicateEmail_returns409() throws Exception {
        mvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "username",    "newuser",
                    "email",       "player@gridclanpuzzle.win",  // already taken in @BeforeEach
                    "password",    "SecurePass123!",
                    "dateOfBirth", "1995-01-01"           // adult — passes COPPA age gate
                ))))
            .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("POST /auth/register — short password returns 400")
    void register_shortPassword_returns400() throws Exception {
        mvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "username", "brandnew",
                    "email",    "brandnew@gridclanpuzzle.win",
                    "password", "short"
                ))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    // import for assertNotNull etc.
    static class Assertions {
        static void assertFalse(boolean v) { assert !v : "Expected false"; }
        static void assertTrue(boolean v)  { assert  v : "Expected true";  }
        static void assertNotNull(Object v){ assert  v != null : "Expected non-null"; }
        static void assertNull(Object v)   { assert  v == null : "Expected null"; }
    }
}
