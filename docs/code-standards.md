# QA-Platform/CMS — Code Standards

## 1. General rules

- Prefer simple, readable code over clever abstractions.
- Make small, focused changes that are easy to review.
- Follow the existing project structure and conventions before introducing a new pattern.
- Do not silently change unrelated files.
- Do not claim a command or test passed unless it was actually run and its result was checked.
- Keep business logic out of UI components where practical.
- Use clear names that explain intent.

## 2. TypeScript / JavaScript

If the project uses TypeScript:
- Prefer TypeScript for application code.
- Avoid `any`; use a real type, `unknown`, or a validated schema.
- Type API request and response payloads.
- Handle nullable values explicitly.
- Avoid unsafe type assertions unless there is a documented reason.
- Use `async/await` and handle rejected promises.

If the project uses JavaScript, use consistent JSDoc types where they materially improve clarity. Do not migrate the whole project between languages without approval.

## 3. Naming and formatting

- Components and classes: `PascalCase`.
- Functions and variables: `camelCase`.
- Constants: follow the project's existing convention; use `UPPER_SNAKE_CASE` for true module-level constants when appropriate.
- File names: follow the framework's convention and stay consistent.
- Use the configured formatter and linter rather than inventing formatting rules.
- Keep functions focused and avoid unnecessary nesting.

## 4. API and validation

- Validate all external input at the server boundary.
- Return predictable response shapes and appropriate HTTP status codes.
- Do not expose stack traces, database details, tokens, or internal exception messages to end users.
- Use pagination for potentially large lists.
- Add timeouts and safe error handling to external API calls.
- Make retryable operations idempotent where possible.
- Keep internal logs useful but sanitized.

## 5. Database

- Use migrations for schema changes.
- Add foreign keys and indexes based on query patterns.
- Use transactions when a multi-step database operation must be atomic.
- Never rely on frontend validation alone.
- Avoid storing duplicate copies of data unless there is a clear reason.
- Store timestamps consistently and display them in the user's chosen/local timezone.
- Do not put secrets in seed files or committed fixtures.

## 6. GitHub integration

- Keep GitHub credentials on the server only.
- Request the minimum permissions required.
- Sanitize error content before placing it in an issue.
- Handle rate limits, permission failures, invalid repositories, and network failures explicitly.
- Save issue references and synchronization status.
- Use stable deduplication keys to avoid repeated issue creation.
- Never automatically close or overwrite an issue without a clearly defined rule.

## 7. Security and privacy

- Never commit `.env`, API keys, passwords, cookies, authentication state files, or private test data.
- Keep `.env.example` limited to placeholder values.
- Redact secrets from test output, logs, screenshots, and GitHub issue bodies.
- Enforce authorization on the backend, not just by hiding UI controls.
- Use secure cookie/session settings if cookie-based authentication is used.
- Validate file uploads and limit size/type if artifact upload is implemented.
- Avoid logging full request headers or request bodies when they may contain secrets.

## 8. Testing standards

- Add unit tests for business rules and helpers.
- Add API/integration tests for ingestion, authorization, GitHub sync, retries, and deduplication.
- Add UI tests for key user flows.
- Test both success and failure paths.
- Use deterministic fixtures; avoid depending on a live GitHub repository in ordinary unit tests.
- Keep secrets and real user data out of test fixtures.
- For Playwright tests, use stable user-facing locators where possible and avoid arbitrary sleeps.

## 9. Error handling

- Show users a clear message and a useful next step.
- Keep technical details in protected logs or a diagnostic view.
- Distinguish validation errors, authentication/permission errors, rate limits, and temporary service failures.
- A failed GitHub sync must remain visible and retryable; it must not make the saved test run disappear.

## 10. Pull requests and commits

- Use descriptive branch names, such as `feat/test-run-dashboard` or `fix/github-issue-deduplication`.
- Use concise commit messages that explain the change.
- Include purpose, main changes, test evidence, screenshots for UI changes, and known limitations in pull requests.
- Do not merge with failing required checks unless an authorized maintainer explicitly approves the exception.
- Review the final diff for accidental changes and secrets before committing.

## 11. Definition of done

A change is done when:
- Requirements and acceptance criteria are met.
- Relevant tests and checks are run, with results reported accurately.
- Error/loading/empty states are handled.
- Security and authorization implications are considered.
- Documentation/configuration is updated when needed.
- No unrelated files or secrets are included.
