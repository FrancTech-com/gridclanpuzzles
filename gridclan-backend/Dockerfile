# ============================================================
# GridClan Backend — Dockerfile (multi-stage)
#
# Stage 1: Maven build
# Stage 2: Minimal JRE runtime — Eclipse Temurin 21 alpine
#
# Non-root user: gridclan (uid 1001)
# Port: 8080
# Health: /actuator/health
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21-alpine AS builder

WORKDIR /build

# Cache dependency layer — only re-downloaded when pom.xml changes
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Build — skip tests (run separately in CI)
COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

# Security: create non-root user
RUN addgroup -S gridclan && adduser -S -G gridclan -u 1001 gridclan

WORKDIR /app

# Copy fat JAR from builder
COPY --from=builder /build/target/gridclan-backend-*.jar app.jar

# Set ownership
RUN chown gridclan:gridclan app.jar

USER gridclan

# Expose app port
EXPOSE 8080

# Health check — Docker monitors this directly. Probe the actual listen port
# ($PORT on PaaS like Railway; 8080 locally) — hardcoding 8080 fails on Railway.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/actuator/health" || exit 1

# JVM startup flags. Heap is sized from the container memory limit via
# MaxRAMPercentage — do NOT also set -Xmx (it overrides the percentage and can
# exceed a small container, causing OOM kills / restart loops).
ENV JAVA_OPTS="-XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -Djava.security.egd=file:/dev/./urandom \
  -Dspring.profiles.active=prod"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
