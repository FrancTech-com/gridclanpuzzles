package com.gridclan.service;

import com.gridclan.entity.User;
import com.gridclan.exception.UserNotFoundException;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepo;

    public boolean isPendingDeletion(UUID userId) { return userRepo.isPendingDeletion(userId); }
    public boolean isSuspended(UUID userId)       { return userRepo.isSuspended(userId, Instant.now()); }

    /**
     * True if the access token's "tv" claim still matches the user's current session
     * epoch. A bump (logout / password reset) makes every older token fail this check.
     * Tokens minted before this feature carry no tv → treated as 0 (the default).
     */
    public boolean isTokenVersionCurrent(UUID userId, int tokenVersion) {
        Integer current = userRepo.tokenVersion(userId);
        return current != null && current == tokenVersion;
    }

    @Transactional
    public User getById(UUID userId) {
        return userRepo.findById(userId).orElseThrow(UserNotFoundException::new);
    }
}
