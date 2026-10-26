# QA-Platform/CMS — UI Context

## 1. Product feel

The interface should feel like a focused QA operations dashboard: clear, practical, information-dense, and easy to scan. Prioritize understanding failures and taking the next action over decorative visuals.

Do not copy the DTR application's UI without a specific reason. This is a separate tool for QA workflows.

## 2. Main navigation

Suggested primary navigation:
- **Overview** — health and recent activity.
- **Test Runs** — searchable list of submitted runs.
- **Failures** — recurring and current failures.
- **GitHub Issues** — linked defects and synchronization status.
- **Notifications** — important events.
- **Settings** — project, repository, and integration configuration.

Hide or protect settings based on permissions.

## 3. Overview dashboard

Useful summary cards:
- Latest run status.
- Total tests in the latest run.
- Passed / failed / skipped counts.
- Pass rate.
- New failures.
- GitHub sync errors.

Below the cards:
- Recent test runs.
- Most frequently failing tests.
- Recently created or updated GitHub Issues.
- Recent integration errors, if the user has permission to view them.

Do not use charts unless they answer a clear question. Always show the time period and denominator for percentages.

## 4. Test-run list

Each row/card should show:
- Run identifier or readable name.
- Project/repository.
- Branch and commit when provided.
- Start time and duration.
- Passed, failed, skipped, and total counts.
- Overall status.
- Source (local run or CI) when known.

Provide filters for date range, project, branch, overall status, and role/test project when available. Use pagination for large histories.

## 5. Test-run details

Suggested layout:
- Run summary at the top.
- Counts and duration.
- Filters or tabs for all tests, failures, skipped, and passed.
- Test-result table.
- Links to commit and run artifacts when safe and available.

Failed test row should make it easy to open detailed diagnostics. Do not overwhelm the list with a full stack trace.

## 6. Failure detail

Show:
- Test title and project/role.
- First observed and most recent occurrence.
- Number of occurrences.
- Sanitized error message.
- Stack trace in a readable, copyable panel.
- Screenshot/trace links if available.
- Related runs.
- Linked GitHub Issue and sync status.
- Clear action: **Create GitHub Issue** or **Open linked issue**.

If issue creation fails, keep the failure visible and show a retry action with a human-readable explanation.

## 7. Status language

Use consistent, plain labels:
- **Passed**
- **Failed**
- **Skipped**
- **Running**
- **Queued**
- **Synced**
- **Sync failed**
- **Needs attention**

Use color as a secondary cue, not the only cue. Include text or icons so the status is understandable without color.

## 8. Interaction and accessibility

- Use clear page titles and descriptive button labels.
- Make keyboard focus visible.
- Ensure forms have labels and validation messages.
- Confirm destructive actions before proceeding.
- Preserve filters when navigating back from details.
- Provide loading, empty, error, and success states for every data-driven screen.
- Avoid showing raw HTTP status codes or internal exception messages as the main user-facing error.
- Use responsive layouts for desktop and smaller screens.
- Avoid arbitrary animation that delays important actions.

## 9. Design-system guidance

Before inventing new tokens, inspect the project's existing UI framework and styles. Define reusable tokens for spacing, typography, surfaces, borders, and status colors. Use shared components for cards, tables, badges, alerts, dialogs, and empty states.

Do not introduce a large component library without a reason. Keep components consistent and easy to maintain.

## 10. Data safety

- Do not show secrets, session cookies, authentication state, or raw environment variables.
- Sanitize error messages and stack traces before display.
- Only show repository links and artifacts to authorized users.
- Avoid including sensitive test data in screenshots or issue descriptions.
