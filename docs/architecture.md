# QA-Platform/CMS — Architecture

## 1. Purpose

QA-Platform/CMS is a central dashboard for collecting Playwright automation results, reviewing failures, tracking defects, and creating or updating GitHub Issues. It should help a QA engineer move from a failed test to a tracked, actionable bug without manually copying logs.

**Initial scope:** the CMS is a separate web application. It connects to the existing Internship DTR Playwright automation project and to GitHub. It does not need to be embedded inside the DTR application.

## 2. High-level architecture

```text
Internship DTR application
          ▲
          │ browser tests
          │
Playwright test suite
          │
          ├── test results / report / error details
          ▼
QA Platform ingestion endpoint
          │
          ▼
Backend API ─────── Database
     │                  │
     ├── Authentication │ stores runs, tests, failures,
     ├── Validation     │ defect links, sync status
     ├── Deduplication  │
     └── Job queue      │
            │           │
            ├── GitHub integration ───── GitHub Issues / Pull Requests
            │
            └── Notifications ────────── In-app notifications
                                         (email/chat later if needed)
```

## 3. Main components

### A. Playwright reporter / uploader
- Runs with the existing Playwright test suite.
- Collects run metadata, test title, project/role, status, duration, error summary, stack trace, retry count, and links to artifacts when available.
- Sends results to the CMS through an authenticated API.
- Must not upload passwords, session files, cookies, access tokens, or other secrets.
- Should support a local JSON report as a fallback if the CMS is temporarily unavailable.

### B. CMS frontend
- Dashboard for recent runs and pass/fail trends (`/`).
- Test-run details with failed tests and error information (`/runs`, `/runs/[id]`).
- Failure details with a readable stack trace and available diagnostics (`/failures`, `/failures/[id]`).
- Defect management and GitHub action controls: "Create GitHub Issue", "Open Linked Issue", and "Retry Synchronization" with audit trail.
- Settings view for GitHub connection and project configuration, restricted to authorized users.

### C. Backend API
- Authenticates users and incoming Playwright submissions.
- Validates and normalizes incoming test results.
- Persists runs, test results, failures, GitHub links, and sync history.
- Provides paginated/filterable endpoints to the frontend.
- Uses background jobs for GitHub calls and notifications where practical.

### D. Database
The persistence layer uses PostgreSQL managed via Prisma ORM (`prisma/schema.prisma`).
Implemented core entities:
- `Project`: Root project/repository entity (`key`, `name`, `repositoryUrl`, `apiKeyHash`).
- `TestRun`: Test execution record (`projectId`, `runNumber`, `branch`, `commitSha`, `status`, counters, `durationMs`).
- `TestResult`: Individual test case outcome (`testRunId`, `suiteTitle`, `testTitle`, `specFile`, `role`, `status`, `durationMs`).
- `FailureSignature`: Normalized deduplication signature (`signatureHash`, `errorType`, `normalizedError`, `occurrenceCount`).
- `FailureDetail`: Granular error and stack trace diagnostics tied 1:1 to a failed `TestResult`.
- `Defect`: Tracked defect linked 1:1 to a `FailureSignature` and connected to a GitHub issue (`githubIssueNumber`, `syncStatus`).
- `GitHubSyncEvent`: Audit trail of GitHub integration interactions (`defectId`, `action`, `status`, `errorMessage`).

Access pattern:
- Client singleton in `lib/prisma.ts` with global connection reuse in development and server-only execution guard.
- All database credentials remain strictly server-side through `DATABASE_URL`.

### E. GitHub integration
- Use the GitHub API to create or update Issues in the configured repository (`lib/github/client.ts`).
- Include a concise title, reproducible failure summary, affected test, run link, environment, and sanitized error details (`lib/github/formatter.ts`).
- Save the GitHub issue number and URL in the CMS (`Defect` model).
- Avoid creating a new issue for every repeat failure: check existing `Defect` on `FailureSignature`, and query GitHub issue search by `signatureHash`.
- Treat API rate limits, network errors, permission errors, and validation errors as recoverable states with visible sync status and audit trail (`GitHubSyncEvent`).

### F. Notifications
- Notify authorized users when a run completes, a new failure appears, or GitHub synchronization fails.
- Start with in-app notifications. Add email or chat integrations only when needed.
- Notifications are a convenience; the database remains the source of truth.

## 4. Suggested data flow

1. A developer or CI job runs Playwright.
2. The reporter creates a sanitized run payload.
3. The CMS ingestion endpoint authenticates and validates it.
4. The backend stores the run and test results.
5. The backend calculates a failure signature for each failed test.
6. A background job or user action checks whether a matching defect already exists.
7. If not already synced, creates a GitHub Issue with full sanitization.
8. The CMS displays the result and GitHub sync status with retry capabilities.
9. A notification is generated for relevant users.

## 5. API Endpoints

| Method | Route | Purpose | Status |
|---|---|---|---|
| `POST` | `/api/v1/test-runs` | Submit a Playwright run | **Implemented** |
| `GET` | `/api/v1/health` | Basic health check | **Implemented** |
| `POST` | `/api/v1/failures/:id/github-issue` | Create or sync GitHub Issue | **Implemented** |
| `POST` | `/api/v1/defects/:id/retry-sync` | Retry failed synchronization | **Implemented** |
| `POST` | `/api/v1/github/webhook` | Receive configured GitHub webhook events | Planned |

### Ingestion Contract (`POST /api/v1/test-runs`)
- **Headers:** `x-api-key: <CMS_API_KEY>` or `Authorization: Bearer <CMS_API_KEY>`
- **Content-Type:** `application/json`
- **Max Payload Size:** 5MB (enforced via Content-Length header and stream byte length)
- **Status Codes:**
  - `201 Created`: New test run, test results, and failure signatures recorded.
  - `200 OK`: Idempotent duplicate recognized (matches existing `idempotencyKey`).
  - `400 Bad Request`: Malformed JSON or Zod schema validation errors.
  - `401 Unauthorized`: Missing or invalid API key.
  - `413 Payload Too Large`: Payload exceeds 5MB.
  - `500 Internal Server Error`: Server/database error with sanitized response.
- **Sanitization:** Automatically redacts passwords, bearer tokens, API keys, cookies, embedded URL credentials, ANSI codes, and local filesystem user paths before persistence.
- **Deduplication:** Computes deterministic SHA-256 failure signature hashes using normalized spec files, test titles, and stripped error diagnostics.

### GitHub Issue & Deduplication Workflow (`POST /api/v1/failures/:id/github-issue`)
- **Headers:** Authorized via CMS session or `x-api-key` / `Authorization: Bearer`.
- **Deduplication Pipeline:**
  1. Checks existing database `Defect` on `failureSignatureId`. If already `SYNCED`, returns existing issue reference without making outbound API calls.
  2. Protects against concurrent double-submissions: If status is `PENDING` within the last 30s, returns 409 Conflict.
  3. Searches GitHub repository issues by `signatureHash` using `GET /search/issues` to catch issues previously created but unlinked.
  4. Formats title `[Bug] <Test Title>: <Summary>` (max 150 chars) and markdown body with spec table, sanitized diagnostics, collapsible `<details>` stack trace, and CMS backlink.
  5. Creates issue via `POST /repos/{owner}/{repo}/issues` with labels (`automated-defect`, `qa-failure`, `role:<role>`).
  6. Handles transient network/5xx errors with bounded backoff; records `FAILED` status and `GitHubSyncEvent` for immediate triage.

### Synchronization Recovery (`POST /api/v1/defects/:id/retry-sync`)
- Re-executes synchronization for defects in `FAILED` status.
- Prevents redundant duplicate creations by verifying `searchIssueByHash` before triggering creation.
- Logs full audit history in `GitHubSyncEvent` (`CREATE`, `RETRY`, `status`, `errorMessage`).

## 6. Failure deduplication

Build a stable signature from normalized fields:
- project/repository
- test title or test ID
- normalized error name/message
- relevant source location

Remove volatile values such as timestamps, random IDs, temporary paths, and changing line values when they do not identify a different bug. Keep the original error details separately for diagnosis. Deduplication suggests or links an existing defect; it never hides new run occurrences.

## 7. Reliability and security

- Use request validation and payload-size limits.
- Use API tokens or another appropriate service authentication method for Playwright uploads.
- Keep secrets in environment variables or a secret manager (`GITHUB_TOKEN`, `DATABASE_URL`, `CMS_API_KEY`).
- Redact credentials, cookies, tokens, and sensitive user data from logs and issue bodies.
- Apply role-based access to project settings and GitHub configuration.
- Use bounded retries and backoff for temporary GitHub failures.
- Make ingestion idempotent where possible so retries do not create duplicate runs or issues.
- Record sync attempts and errors without logging secrets.
- Add database backups and retention rules before production use.

## 8. Recommended implementation phases

1. **Foundation:** choose stack, create CMS app, configure database, environment variables, linting, and migrations. (Completed)
2. **Data Model & Ingestion:** accept real Playwright results, validate, sanitize, and persist with idempotency. (Completed)
3. **Operations Dashboard:** browse runs, examine failures, review sanitized traces. (Completed)
4. **GitHub Integration & Deduplication:** securely connect repository, create deduplicated issues, track sync events, handle retries. (Completed)
5. **Playwright Reporter Connection:** custom reporter uploading directly from test suites with offline fallback. (Next)
6. **Notifications:** add in-app alerts and user preferences.
7. **CI and Hardening:** run automated tests, add permissions, deployment, monitoring, and documentation.
