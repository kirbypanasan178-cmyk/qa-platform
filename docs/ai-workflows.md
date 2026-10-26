# QA-Platform/CMS — AI Workflows

## 1. Purpose

This document defines how an AI coding assistant should work on QA-Platform/CMS. It is a workflow guide, not permission to execute every command or change every file.

## 2. Before coding

1. Read `AGENTS.md` (or `agents.md` if that is the filename used), `project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, and `progress-tracker.md` when they exist.
2. Inspect the repository structure, package scripts, framework, and current Git status.
3. Identify the requested outcome and the acceptance criteria.
4. Check whether a similar component, endpoint, schema, or helper already exists.
5. List important assumptions. Ask a question only when an unresolved decision could significantly change the implementation or cause destructive work.
6. Propose a short plan for changes that span multiple components.

## 3. Implementation loop

For each task:
1. Make the smallest complete change that satisfies the request.
2. Follow existing architecture and naming.
3. Add or update tests for meaningful behavior.
4. Run the narrowest relevant checks first.
5. Fix issues caused by the change.
6. Review the diff for unrelated edits, secrets, generated files, and accidental deletions.
7. Update documentation and `progress-tracker.md` when the milestone or project state changes.
8. Report files changed, commands actually run, results, and remaining risks.

## 4. Safe command behavior

- Do not repeatedly ask for permission to run harmless, read-only inspection commands when the environment's approved policy already permits them.
- Do not bypass the terminal, operating system, IDE, or agent's security/approval controls.
- Never enable unrestricted command execution or disable safety checks just to avoid prompts.
- Before running a command that deletes files, changes permissions, modifies Git history, installs packages, changes system configuration, deploys, or affects a remote service, explain the impact and obtain approval when required.
- Prefer explicit, scoped commands over broad commands.
- Do not run destructive cleanup commands without identifying the target and confirming it is safe.
- Do not commit, push, merge, deploy, or create/close GitHub Issues unless the user requested that action or the project's approved workflow clearly authorizes it.

## 5. Playwright ingestion workflow

When implementing the Playwright connection:
1. Inspect the existing Playwright version and reporter configuration.
2. Define and document the result payload before coding the uploader and API independently.
3. Include run ID, project, branch/commit if available, timestamps, counts, test titles, statuses, durations, and sanitized errors.
4. Do not upload authentication state files, browser cookies, passwords, access tokens, or `.env` files.
5. Handle CMS unavailability with a timeout and a local report fallback.
6. Test valid submission, invalid payload, authentication failure, duplicate submission, and temporary server failure.

## 6. GitHub Issue workflow

1. Confirm the target repository and authentication method.
2. Keep the credential on the backend, never in frontend JavaScript.
3. Prepare a useful title and body from sanitized diagnostics.
4. Check for an existing linked issue or matching failure signature.
5. Create a new issue only when appropriate.
6. Persist the issue ID/number/URL and sync result.
7. Handle rate limits, missing permissions, invalid repository names, and network errors.
8. Never close or edit unrelated issues automatically.

## 7. Debugging workflow

- Reproduce the problem before changing code when feasible.
- Find the underlying cause rather than adding brittle selectors, arbitrary waits, or broad exception suppression.
- Keep a failing test's actual error available in protected diagnostics.
- Separate application failures from test-environment or network failures.
- Add a regression test for confirmed bugs.
- Never mark a test as passing by weakening its assertion without a justified requirements change.

## 8. Documentation and handoff

At the end of a meaningful task, report:
- **Summary:** what changed.
- **Files:** the key files touched.
- **Verification:** exact checks run and their real outcomes.
- **Limitations:** anything not tested or still blocked.
- **Next step:** the most useful follow-up task.

Update the progress tracker only with work that has actually been completed and verified. Use `[-]` for in-progress and `[!]` for blocked items.

## 9. AI must not

- Invent files, endpoints, database tables, test results, or environment configuration.
- Assume a specific framework before inspecting the repository or receiving confirmation.
- leak secrets into logs, reports, commits, or GitHub issues.
- perform broad refactors when a focused fix is enough.
- silently overwrite user changes.
- delete files just because they appear generated without confirming their role.
- claim that GitHub integration works without testing a real or safely mocked API flow.
