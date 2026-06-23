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

    @Transactional
    public User getById(UUID userId) {
        return userRepo.findById(userId).orElseThrow(UserNotFoundException::new);
    }
}
