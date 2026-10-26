# Agent Instructions — QA-Platform/CMS

## 1. Read this first

You are working on **QA-Platform/CMS**, a separate web application that receives Playwright automation results, presents test runs and failures in a dashboard, and connects failures to GitHub Issues.

Before implementing a task, read the relevant project documents:
- `project-overview.md` — purpose, scope, users, and MVP.
- `architecture.md` — components, data flow, and proposed APIs.
- `code-standards.md` — coding, testing, security, and Git standards.
- `ui-context.md` — dashboard layout and interaction guidance.
- `ai-workflows.md` — expected AI-assisted work process.
- `progress-tracker.md` — current status and next steps.

If a document is missing, continue by inspecting the actual repository and ask only if the missing information blocks a safe decision.

## 2. Source of truth

- The current repository, its package configuration, migrations, tests, and existing implementation are the source of truth for what currently exists.
- Documentation describes intended behavior; it does not prove that a feature has already been implemented.
- Do not assume a framework, database, authentication method, route, or dependency until you inspect the project or the owner confirms it.
- If documentation conflicts with existing code, explain the conflict and propose a minimal resolution before making a broad change.

## 3. Core product goals

- Receive sanitized Playwright test-run results.
- Display runs, pass/fail counts, and failure details.
- Track recurring failures and link them to GitHub Issues.
- Avoid duplicate issues for the same recurring failure.
- Show GitHub synchronization status and allow safe recovery from failures.
- Keep test-run data available even when GitHub or notifications are unavailable.

The first integration target is the Internship DTR Playwright suite, covering `intern`, `coordinator`, `supervisor`, `admin`, and `superadmin`. Keep the CMS separate from the DTR app unless explicitly instructed otherwise.

## 4. Working rules

1. Inspect the relevant files and Git status before editing.
2. Make a short plan for multi-file changes.
3. Make the smallest complete change that meets the request.
4. Follow existing project patterns and `code-standards.md`.
5. Add or update tests for behavior changes.
6. Run relevant checks and report their actual outcomes.
7. Review the diff before finishing.
8. Update documentation and `progress-tracker.md` when appropriate.
9. Report changed files, verification, limitations, and next steps.

Do not overwrite uncommitted user changes. Do not edit unrelated projects or directories. Respect any narrower file/path boundaries explicitly given by the owner.

## 5. Security rules

- Never commit secrets, `.env` files, GitHub credentials, browser cookies, or Playwright authentication-state files.
- Keep GitHub credentials on the server; never expose them to frontend code.
- Sanitize test errors and stack traces before storing or sending them to GitHub.
- Validate all external input on the server.
- Enforce permissions on backend routes, not just in the UI.
- Do not log tokens, passwords, cookies, full sensitive headers, or secret environment values.
- Do not disable security checks to make a workflow easier.

## 6. GitHub issue rules

- Verify the configured repository before creating an issue.
- Check for an existing linked issue or matching failure signature before creating another.
- Save issue identifiers and URLs after successful creation.
- Record and display synchronization failures.
- Retry temporary failures safely; avoid duplicate issues on retries.
- Do not close, delete, or modify unrelated issues unless explicitly requested.

## 7. Testing rules

- Prefer targeted tests first, then broader tests when appropriate.
- Test success and failure paths.
- Do not weaken assertions merely to make a test pass.
- Do not claim a test passed unless the command was run and its result inspected.
- If a check cannot be run, state why and identify what remains unverified.
- Keep ordinary tests independent of a live GitHub repository where possible.

## 8. Command and approval rules

- Use read-only inspection commands freely when the environment permits them.
- Explain potentially destructive or externally visible actions before performing them.
- Obtain approval where the environment requires it for deletion, system changes, dependency installation, remote changes, commits, pushes, merges, or deployment.
- Never circumvent Antigravity CLI, IDE, shell, or operating-system approval controls. If command prompts are inconvenient, explain available supported approval settings instead of disabling safeguards.

## 9. Completion report format

At the end of a task, provide:
- **Completed**
- **Files changed**
- **Tests/checks run**
- **Results**
- **Known limitations**
- **Recommended next step**

Keep the explanation direct and use simple words. Never invent implementation details or verification results.
