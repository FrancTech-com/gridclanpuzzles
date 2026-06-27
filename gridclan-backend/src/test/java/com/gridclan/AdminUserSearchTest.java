package com.gridclan;

import com.gridclan.entity.User;
import com.gridclan.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Validates the admin user search/list query + pagination (H2, no Redis). */
@DataJpaTest
@ActiveProfiles("test")
class AdminUserSearchTest {

    @Autowired UserRepository userRepo;

    private void user(String name, String email, boolean deleted) {
        userRepo.save(User.builder()
            .username(name).email(email).displayName(name).passwordHash("x")
            .deletedAt(deleted ? Instant.now() : null)
            .build());
    }

    @Test
    void emptyQueryReturnsAllNonDeletedPaged() {
        user("alice", "alice@example.com", false);
        user("bob",   "bob@example.com",   false);
        user("ghost", "ghost@example.com", true);   // deleted → excluded

        Page<User> page = userRepo.searchActive("", PageRequest.of(0, 10));
        assertThat(page.getTotalElements()).isEqualTo(2);
    }

    @Test
    void searchMatchesUsernameEmailOrDisplayNameCaseInsensitive() {
        user("Alice", "alice@example.com", false);
        user("bob",   "BOBBY@example.com", false);

        assertThat(userRepo.searchActive("ALI", PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
        assertThat(userRepo.searchActive("bobby", PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
        assertThat(userRepo.searchActive("nobody", PageRequest.of(0, 10)).getTotalElements()).isZero();
    }
}
