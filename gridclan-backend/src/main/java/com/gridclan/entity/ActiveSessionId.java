package com.gridclan.entity;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public class ActiveSessionId implements Serializable {
    private static final long serialVersionUID = 1L;

    private UUID id;
    private Instant startedAt;

    public ActiveSessionId() {}

    public ActiveSessionId(UUID id, Instant startedAt) {
        this.id = id;
        this.startedAt = startedAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ActiveSessionId)) return false;
        ActiveSessionId that = (ActiveSessionId) o;
        return Objects.equals(id, that.id) && Objects.equals(startedAt, that.startedAt);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, startedAt);
    }
}
