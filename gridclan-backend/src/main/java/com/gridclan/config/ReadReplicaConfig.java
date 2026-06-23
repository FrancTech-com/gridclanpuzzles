package com.gridclan.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.util.Map;

/**
 * Supabase read-replica routing (blueprint § Database scalability).
 *
 * Active ONLY when gridclan.datasource.replica-url is set (env
 * GRIDCLAN_DATASOURCE_REPLICAURL); without it Spring Boot autoconfigures
 * the single primary datasource as before — no behaviour change until a
 * replica exists.
 *
 * Routing rule: @Transactional(readOnly = true) → replica; everything
 * else → primary. The LazyConnectionDataSourceProxy defers the physical
 * connection until first use, AFTER the transaction's read-only flag is
 * known — without it every connection would resolve before routing could
 * see the flag.
 *
 * Eventual consistency is acceptable for the routed reads (balance
 * display, profile, export queries); all writes and locking reads
 * (SELECT FOR UPDATE) stay on the primary.
 */
@Configuration
@ConditionalOnProperty(name = "gridclan.datasource.replica-url")
public class ReadReplicaConfig {

    @Bean
    public DataSource dataSource(
            @Value("${spring.datasource.url}")      String primaryUrl,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password}") String password,
            @Value("${gridclan.datasource.replica-url}") String replicaUrl) {

        HikariDataSource primary = pool(primaryUrl, username, password, "gridclan-primary", 20);
        HikariDataSource replica = pool(replicaUrl, username, password, "gridclan-replica", 10);
        replica.setReadOnly(true);

        AbstractRoutingDataSource routing = new AbstractRoutingDataSource() {
            @Override
            protected Object determineCurrentLookupKey() {
                return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                    ? "replica" : "primary";
            }
        };
        routing.setTargetDataSources(Map.of("primary", primary, "replica", replica));
        routing.setDefaultTargetDataSource(primary);
        routing.afterPropertiesSet();

        return new LazyConnectionDataSourceProxy(routing);
    }

    private HikariDataSource pool(String url, String username, String password,
                                  String poolName, int maxSize) {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(url);
        ds.setUsername(username);
        ds.setPassword(password);
        ds.setPoolName(poolName);
        ds.setMaximumPoolSize(maxSize);   // pgbouncer budget per instance
        ds.setMinimumIdle(2);
        ds.setConnectionTimeout(20_000);
        return ds;
    }
}
