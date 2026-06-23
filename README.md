# GridClan Puzzles

Competitive, free-to-play puzzle-gaming platform for emerging markets and beyond.
Players earn points through skill-based gameplay — points are a pure skill metric with no real-world value. No pay-to-play and no cashouts, ever.

## Repository layout

This folder (**`GRIDCLAN PROJECT`**) is the project root. It contains the two sub-projects:

```
GRIDCLAN PROJECT/
├── gridclan-backend/    — Java 21 / Spring Boot 3.3 authoritative game server
└── gridclan-frontend/   — React Native (Expo SDK 51) mobile app
```

Each sub-project is self-contained: open the one you want to work on and run its commands from inside that folder.

## How to use

### 1. Get the code

```bash
cd "GRIDCLAN PROJECT"      # this folder — the parent of the two sub-projects
ls                         # you should see: gridclan-backend  gridclan-frontend
```

### 2. Backend — `gridclan-backend/`

Requires **JDK 21**, plus PostgreSQL 15 and Redis (for local runs). All commands run from inside `gridclan-backend/`.

```bash
cd gridclan-backend

# Configure secrets
cp .env.example .env       # then fill in DB / Redis / JWT values

# Build
mvn clean package -DskipTests

# Run all tests (H2 in-memory; Redis required for the HTTP integration tests)
mvn test

# Run a single test class
mvn test -Dtest=IntegrationTest

# Run locally (needs Postgres + Redis from .env)
mvn spring-boot:run

# Or bring up the full stack (app + Postgres + Redis + NGINX) with Docker
docker-compose up -d
docker-compose logs -f app
```

> If a Maven wrapper (`mvnw`) has been added to the repo you can substitute `./mvnw` for `mvn`; otherwise use a locally installed `mvn`.

Tests use the `test` Spring profile (`application-test.yml`): Postgres → H2, Flyway disabled. The HTTP integration tests talk to Redis through the rate-limit filter, so start a local Redis first, e.g.:

```bash
docker run -d --rm -p 6379:6379 --name gridclan-redis redis:7-alpine
```

### 3. Frontend — `gridclan-frontend/`

Requires **Node.js** + the Expo tooling. All commands run from inside `gridclan-frontend/`.

```bash
cd gridclan-frontend

npm install

npm start        # Expo dev server (scan the QR code with Expo Go)
npm run android  # launch on an Android emulator
npm run ios      # launch on an iOS simulator
npm test         # Jest (jest-expo preset)
```

The API base URL is read from `Constants.expoConfig.extra.API_BASE_URL` in `gridclan-frontend/app.json`
(default `https://api.gridclanpuzzle.win`). Point it at your local backend (e.g. `http://10.0.2.2:8080` for the Android emulator) during development.

## Database migrations

Schema is managed by Flyway under `gridclan-backend/src/main/resources/db/migration/`.
Migrations are immutable — add a new `V{N}__description.sql`, never edit an applied one.
Current head: **V9** (`V9__drop_preferred_currency.sql`).

## More detail

- Backend architecture, security invariants, and endpoints: [`gridclan-backend/README.md`](gridclan-backend/README.md)
- Working agreement & conventions for AI assistance: [`CLAUDE.md`](CLAUDE.md)
