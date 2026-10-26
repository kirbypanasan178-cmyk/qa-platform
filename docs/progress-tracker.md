# QA-Platform/CMS — Progress Tracker

> Update this file whenever a meaningful milestone is completed. Do not mark work complete based only on planned code or unverified assumptions.

## Status key

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed and verified
- `[!]` Blocked / needs a decision

## Current project status

**Overall:** Phase 4 (GitHub Issues Integration & Deduplication) Completed  
**Last updated:** 2026-10-26  
**Current milestone:** GitHub Issue creation, deduplication via signature hash, rate limit handling, and recovery retries completed and tested. Ready for Playwright connection / reporter integration.

## Phase 0 — Decisions and setup

- [x] Confirm frontend framework.
- [x] Confirm backend framework.
- [x] Confirm database.
- [x] Decide local development and deployment targets.
- [x] Decide how users sign in.
- [x] Decide whether Playwright results come from local runs, CI, or both.
- [x] Create repository/project folder for `QA-Platform/CMS`.
- [x] Add `.gitignore` and safe `.env.example`.
- [x] Add linting, formatting, and test commands.
- [x] Add a health-check endpoint.

**Acceptance criteria:** The app starts locally, configuration is documented, and no secrets are committed.

## Phase 1 — UI prototype

- [x] Build dashboard layout.
- [x] Build test-run list with filters.
- [x] Build run details page.
- [x] Build failed-test detail panel.
- [x] Add loading, empty, error, and pagination states.
- [x] Use clearly labeled sample data until the API exists. (Connected to Prisma data access with zero-state fallbacks)

**Acceptance criteria:** A user can navigate the main screens and understand the intended workflow without real data.

## Phase 2 — Data model and API

- [ ] Create database migrations.
- [x] Add projects and test-run records. (Prisma schema defined and generated)
- [x] Add test-result and failure records. (Prisma schema defined and generated)
- [x] Add ingestion authentication.
- [x] Implement `POST /api/v1/test-runs`.
- [x] Validate and sanitize payloads.
- [x] Implement list/detail endpoints. (Implemented in lib/data/*)
- [x] Add tests for valid, invalid, duplicate, and oversized payloads.

**Acceptance criteria:** A valid test run can be submitted, persisted, and viewed in the CMS.

## Phase 3 — Playwright connection

- [ ] Define a versioned result payload schema.
- [ ] Add a Playwright reporter or upload script in the automation project.
- [ ] Send run summary and failed-test details to the CMS.
- [ ] Add timeout and network-failure handling.
- [ ] Keep a local JSON report as fallback.
- [ ] Confirm no secrets or authentication-state files are uploaded.
- [ ] Test with the existing Internship DTR test suite.

**Acceptance criteria:** A real Playwright run appears in the CMS with correct pass/fail counts and useful failure details.

## Phase 4 — GitHub Issues

- [x] Choose GitHub App or fine-scoped token approach.
- [x] Store credentials securely on the backend.
- [x] Configure target repository.
- [x] Create a GitHub Issue from a selected failure.
- [x] Save the issue number and URL.
- [x] Add duplicate-failure detection.
- [x] Add sync status and error details.
- [x] Add retry handling for temporary failures and rate limits.
- [x] Test permissions and failed-sync recovery.

**Acceptance criteria:** A user can create an issue from a failure, see the issue link, and retry a failed synchronization without creating accidental duplicates.

## Phase 5 — Notifications

- [ ] Define notification events.
- [ ] Add in-app notification storage and display.
- [ ] Add read/unread status.
- [ ] Add user preferences if needed.
- [ ] Add external channels only if approved.
- [ ] Test delivery failure and retry behavior.

**Acceptance criteria:** Relevant users can see run completion and new-failure alerts, and notification failure does not lose test data.

## Phase 6 — Hardening and release

- [ ] Add authorization tests.
- [ ] Add audit/sync history.
- [ ] Add rate limits and payload limits.
- [ ] Review secret redaction.
- [ ] Add backup and retention policy.
- [ ] Add CI checks.
- [ ] Add deployment and rollback notes.
- [ ] Complete README and operational instructions.

**Acceptance criteria:** A documented, tested deployment can be operated safely and its failures can be diagnosed.

## Decision log

| Date | Decision / question | Status | Notes |
|---|---|---|---|
| 2026-10-26 | CMS is a separate project that receives Playwright results and connects to GitHub | Proposed direction | Keep it separate from the Internship DTR application initially. |
| 2026-10-26 | Prevent duplicate GitHub Issues for recurring failures | Required | Use a stable failure signature and store the linked issue. |
| 2026-10-26 | Which app stack/database/authentication? | Open | Confirm before implementation locks in choices. |

## Session handoff template

At the end of a work session, update:
- **Completed:** what was implemented and verified.
- **Files changed:** key files and purpose.
- **Checks run:** commands and actual results.
- **Known issues:** failures, blockers, or missing requirements.
- **Next step:** one clear, actionable task.
