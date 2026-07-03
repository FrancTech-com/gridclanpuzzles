package com.gridclan.repository;

import com.gridclan.entity.PlayerWallet;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerWalletRepository extends JpaRepository<PlayerWallet, UUID> {

    List<PlayerWallet> findByUserId(UUID userId);

    Optional<PlayerWallet> findByUserIdAndCurrency(UUID userId, String currency);

    /** Row-locked lookup for balance mutations (SELECT FOR UPDATE) so concurrent
     *  withdrawals / credits can't race the balance. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from PlayerWallet w where w.userId = :userId and w.currency = :currency")
    Optional<PlayerWallet> lockByUserIdAndCurrency(@Param("userId") UUID userId,
                                                   @Param("currency") String currency);
}
