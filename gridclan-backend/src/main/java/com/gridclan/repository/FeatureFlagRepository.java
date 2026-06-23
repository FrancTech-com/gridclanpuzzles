package com.gridclan.repository;

import com.gridclan.entity.FeatureFlag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FeatureFlagRepository extends JpaRepository<FeatureFlag, UUID> {
    Optional<FeatureFlag> findByFlagNameAndCountryCode(String flagName, String countryCode);
    List<FeatureFlag> findByFlagName(String flagName);
}
