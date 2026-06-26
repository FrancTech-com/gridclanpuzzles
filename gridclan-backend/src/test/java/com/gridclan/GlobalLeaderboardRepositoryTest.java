package com.gridclan;

import com.gridclan.entity.PlayerGamePoints;
import com.gridclan.entity.User;
import com.gridclan.repository.PlayerGamePointsRepository;
import com.gridclan.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validates the per-game leaderboard JPQL (cross-join PlayerGamePoints↔User,
 * total aggregation + breakdown + per-game ranking, eligibility filters).
 * Runs on the H2 test profile, no Redis.
 */
@DataJpaTest
@ActiveProfiles("test")
class GlobalLeaderboardRepositoryTest {

    @Autowired PlayerGamePointsRepository gamePointsRepo;
    @Autowired UserRepository userRepo;

    private UUID user(String name, boolean active, boolean suspended, boolean deleting) {
        User u = userRepo.save(User.builder()
            .username(name + "_u")
            .email(name + "@example.com")
            .displayName(name)
            .passwordHash("x")
            .isActive(active)
            .isSuspended(suspended)
            .deletionRequestedAt(deleting ? Instant.now() : null)
            .build());
        return u.getId();
    }

    private void points(UUID userId, String game, long pts) {
        gamePointsRepo.save(PlayerGamePoints.builder().userId(userId).gameType(game).points(pts).build());
    }

    @Test
    void ranksByTotalAcrossGamesAndExcludesIneligible() {
        UUID alice = user("Alice", true, false, false);
        points(alice, "WORD_SEARCH", 300);
        points(alice, "SCRABBLE",    250);   // total 550

        UUID bob = user("Bob", true, false, false);
        points(bob, "GOMOKU",     200);
        points(bob, "BATTLESHIP", 150);       // total 350

        UUID susie = user("Susie", true, true, false);   // suspended → excluded
        points(susie, "WORD_SEARCH", 9999);

        List<Object[]> top = gamePointsRepo.findTopByTotal(PageRequest.of(0, 10));

        assertThat(top).hasSize(2);
        assertThat(top.get(0)[1]).isEqualTo("Alice");
        assertThat(((Number) top.get(0)[2]).longValue()).isEqualTo(550L);
        assertThat(top.get(1)[1]).isEqualTo("Bob");
        assertThat(((Number) top.get(1)[2]).longValue()).isEqualTo(350L);

        // Breakdown for the ranked users
        List<UUID> ids = top.stream().map(r -> (UUID) r[0]).toList();
        List<Object[]> bd = gamePointsRepo.findBreakdownForUsers(ids);
        assertThat(bd).hasSize(4); // 2 games each
    }

    @Test
    void ranksWithinASingleGame() {
        UUID a = user("A", true, false, false);
        UUID b = user("B", true, false, false);
        points(a, "SCRABBLE", 100);
        points(a, "GOMOKU",   999);   // must NOT affect the SCRABBLE board
        points(b, "SCRABBLE", 400);

        List<Object[]> top = gamePointsRepo.findTopByGame("SCRABBLE", PageRequest.of(0, 10));

        assertThat(top).hasSize(2);
        assertThat(top.get(0)[0]).isEqualTo("B");
        assertThat(((Number) top.get(0)[1]).longValue()).isEqualTo(400L);
        assertThat(top.get(1)[0]).isEqualTo("A");
    }
}
