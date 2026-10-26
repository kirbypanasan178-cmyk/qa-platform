# QA-Platform/CMS

A centralized quality assurance dashboard and ingestion service for automated Playwright test results, recurring failure triage, and GitHub Issues defect tracking.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5 (Strict mode)
- **Database:** PostgreSQL via Prisma ORM 6
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest 3
- **Runtime:** Node.js (v22+)

## Getting Started

### 1. Prerequisites
- Node.js 20 or 22+
- npm 10+

### 2. Environment Configuration
Copy the template configuration file:
```bash
cp .env.example .env.local
```
> **Important:** `.env.example` contains documented placeholders for required environment variables (`DATABASE_URL`, `CMS_API_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`). Never commit real credentials or active `.env*` files to source control.

### 3. Development Server
Run the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

## Testing, Database, and Quality Checks

- **Run unit & database tests:**
  ```bash
  npm test
  ```
- **Run tests in watch mode:**
  ```bash
  npm run test:watch
  ```
- **Generate Prisma Client:**
  ```bash
  npm run db:generate
  ```
- **Run linter:**
  ```bash
  npm run lint
  ```
- **Build production bundle:**
  ```bash
  npm run build
  ```

## Health Endpoint

- **Route:** `GET /api/v1/health`
- **Purpose:** Lightweight, unauthenticated liveness check for monitoring and container health probes.
- **Cache-Control:** `no-store, max-age=0` (always returns a dynamic timestamp).
- **Sample Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-26T08:23:45.123Z"
  }
  ```

## Ingestion API Endpoint

- **Route:** `POST /api/v1/test-runs`
- **Authentication:** `X-API-Key: <CMS_API_KEY>` or `Authorization: Bearer <CMS_API_KEY>`
- **Content-Type:** `application/json`
- **Max Payload Size:** 5MB
- **Sample Payload:**
  ```json
  {
    "projectKey": "internship-dtr",
    "projectName": "Internship DTR Automation",
    "idempotencyKey": "ci-run-20261026-001",
    "runNumber": 42,
    "branch": "main",
    "commitSha": "a1b2c3d4e5f6",
    "environment": "ci",
    "triggeredBy": "github-actions",
    "totalTests": 5,
    "passedCount": 4,
    "failedCount": 1,
    "skippedCount": 0,
    "durationMs": 14250,
    "testResults": [
      {
        "suiteTitle": "Intern Portal",
        "testTitle": "should clock in successfully",
        "specFile": "tests/intern/dtr.spec.ts",
        "role": "intern",
        "status": "FAILED",
        "durationMs": 4200,
        "error": {
          "message": "locator.click: Timeout 5000ms exceeded",
          "stackTrace": "at tests/intern/dtr.spec.ts:34:12",
          "errorType": "TimeoutError"
        }
      }
    ]
  }
  ```
- **Responses:**
  - `201 Created`: Test run recorded and stored.
  - `200 OK`: Duplicate idempotency key recognized.
  - `400 Bad Request`: Payload validation failed or malformed JSON.
  - `401 Unauthorized`: Missing or invalid API key.
  - `413 Payload Too Large`: Payload exceeds 5MB.
  - `500 Internal Server Error`: Sanitized database or server failure.

## Architecture & Roadmap

For full project architecture, data flows, and coding standards, refer to:
- [`docs/project-overview.md`](docs/project-overview.md) — High-level project scope and MVP goals.
- [`docs/architecture.md`](docs/architecture.md) — Architectural components, data flow, and API contracts.
- [`docs/code-standards.md`](docs/code-standards.md) — Coding conventions, testing, and security rules.
- [`docs/progress-tracker.md`](docs/progress-tracker.md) — Milestone tracking and implementation status.

**Next Phase:** Phase 1 — PostgreSQL and Prisma Setup (Schema definition, migrations, and database client).
