package com.gridclan.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "client_error_events")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ClientErrorEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "error_type", nullable = false, length = 100)
    private String errorType;

    @Column(name = "error_message", nullable = false, columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "stack_trace", columnDefinition = "TEXT")
    private String stackTrace;

    @Column(name = "component_name", length = 200)
    private String componentName;

    @Column(name = "screen_name", length = 200)
    private String screenName;

    @Column(name = "app_version", length = 50)
    private String appVersion;

    @Column(name = "platform", length = 20)
    private String platform;

    @Column(name = "device_model", length = 100)
    private String deviceModel;

    @Column(name = "os_version", length = 50)
    private String osVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extra", columnDefinition = "jsonb")
    private Map<String, Object> extra;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
