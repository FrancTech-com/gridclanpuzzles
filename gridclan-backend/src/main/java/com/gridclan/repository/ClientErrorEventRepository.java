package com.gridclan.repository;

import com.gridclan.entity.ClientErrorEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface ClientErrorEventRepository extends JpaRepository<ClientErrorEvent, UUID> {

    List<ClientErrorEvent> findByOrderByCreatedAtDesc(Pageable pageable);

    List<ClientErrorEvent> findByErrorTypeOrderByCreatedAtDesc(String errorType, Pageable pageable);

    @Query("SELECT COUNT(e) FROM ClientErrorEvent e WHERE e.createdAt >= :since")
    long countSince(@Param("since") Instant since);

    @Query("SELECT e.errorType, COUNT(e) FROM ClientErrorEvent e " +
           "WHERE e.createdAt >= :since GROUP BY e.errorType ORDER BY COUNT(e) DESC")
    List<Object[]> countByTypeSince(@Param("since") Instant since);
}
