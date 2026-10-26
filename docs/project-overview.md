# QA-Platform/CMS — Project Overview

## 1. What this project is

QA-Platform/CMS is a web-based quality assurance dashboard that collects automated Playwright test results, organizes failures, and connects them to GitHub Issues.

The first integration target is the existing Internship DTR Playwright automation suite, which tests the `intern`, `coordinator`, `supervisor`, `admin`, and `superadmin` roles.

The CMS is a **separate application** at first. It should not be added directly into the DTR application unless there is a future, deliberate decision to embed it.

## 2. The problem

After a Playwright run, failures can be spread across terminal output, HTML reports, screenshots, traces, and manually written bug reports. This makes it harder to see trends, share results, and track whether a failure has become a GitHub issue.

The platform should provide one place to:
- See recent test runs and pass/fail counts.
- Open a failed test and understand what happened.
- Track repeated failures across runs.
- Create or link a GitHub Issue.
- See whether GitHub synchronization succeeded.
- Receive notifications about important events.

## 3. Main workflow

1. Run Playwright locally or through CI.
2. Send a sanitized test-run summary to the CMS.
3. Review the run in the dashboard.
4. Open a failed test for details.
5. Create a GitHub Issue or link the failure to an existing issue.
6. Track issue and synchronization status from the CMS.
7. Receive a notification when configured events occur.

## 4. MVP features

### Required for the first usable version
- Dashboard with recent test runs.
- Test-run list and detail page.
- Failed-test details, including error summary and stack trace.
- Secure endpoint for accepting Playwright results.
- Persistent database storage.
- GitHub Issue creation for a selected failure.
- GitHub issue link and sync status in the CMS.
- Duplicate issue protection.
- Clear loading, empty, success, and error states.

### Later improvements
- Historical trends and flaky-test detection.
- Role/project filters and saved views.
- In-app notifications.
- GitHub webhook updates.
- CI pipeline integration.
- Artifact viewing for screenshots and traces.
- Team assignment, comments, labels, and release grouping.

## 5. Users

- **QA engineer:** reviews test runs, investigates failures, and creates defect reports.
- **Developer:** uses the failure details and linked issue to reproduce and fix a bug.
- **QA lead / maintainer:** reviews trends, monitors issue synchronization, and configures projects and permissions.

Authentication and permissions should be implemented according to the actual team and deployment requirements.

## 6. Non-goals for the MVP

- Replacing Playwright or the existing test suite.
- Replacing GitHub Issues.
- Automatically changing application code to fix failures.
- Storing credentials, browser cookies, or Playwright authentication-state files.
- Building a full general-purpose project-management platform.
- Treating every failed retry as a separate defect.

## 7. Success measures

- A completed Playwright run can be viewed in the CMS.
- Failure details are useful enough to help reproduce the issue.
- Creating an issue takes fewer manual steps than writing it from scratch.
- Repeated occurrences do not automatically create duplicate issues.
- Failed GitHub synchronization is visible and recoverable.
- No secrets are leaked through uploaded reports or issue descriptions.

## 8. Initial technology choices

The final stack is not confirmed in this document. Choose it before creating framework-specific structure. Prefer technologies the project owner can maintain and deploy reliably. Keep the integration contract between Playwright and the CMS independent from the UI framework.

## 9. Key project rule

**The CMS is the central record of test runs; GitHub Issues are the defect-tracking destination.** A GitHub API outage must not erase a stored test run or make its failure details unavailable.
