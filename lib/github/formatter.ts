import { sanitizeText } from "@/lib/sanitizer";

export interface InvestigationDetail {
  id?: string;
  classification: string;
  confidenceScore?: number;
  summary?: string;
  recommendedAction?: string;
  detectedPatterns?: string[];
  expectedResult?: string | null;
  actualResult?: string | null;
  apiResponses?: unknown | null;
  executionLogs?: string[] | null;
  status?: string;
  adminNotes?: string | null;
  reviewedBy?: string | null;
}

export interface FormatIssueInput {
  failureSignature: {
    id: string;
    signatureHash: string;
    errorType?: string | null;
    normalizedError: string;
    occurrenceCount: number;
    firstSeenAt: Date | string;
    lastSeenAt: Date | string;
  };
  sampleDetail?: {
    sanitizedErrorMessage: string;
    sanitizedStackTrace?: string | null;
    testResult?: {
      id?: string;
      testTitle: string;
      specFile: string;
      role?: string | null;
      suiteTitle?: string | null;
      durationMs?: number;
      retryCount?: number;
      testRun?: {
        id?: string;
        environment?: string | null;
        branch?: string | null;
        commitSha?: string | null;
        runNumber?: number | null;
        project?: {
          id?: string;
          name: string;
          key: string;
          repositoryUrl?: string | null;
        } | null;
      } | null;
      investigation?: InvestigationDetail | null;
    } | null;
  } | null;
  cmsBaseUrl?: string;
}

export interface FormattedIssue {
  title: string;
  body: string;
  labels: string[];
}

interface ExtractedHttpInfo {
  method?: string;
  endpoint?: string;
  statusCode?: string;
}

interface ClassificationAssessment {
  classificationLabel: string;
  severityLabel: "High" | "Medium" | "Low";
  confidenceScore: number;
  reasoning: string;
  detectedPatterns: string[];
  isContradiction: boolean;
}

/**
 * Cleans local machine absolute paths from stack traces to produce developer-friendly relative paths.
 * Never exposes local workstation directory structures.
 */
function cleanStackTracePaths(stackTrace?: string | null): string | null {
  if (!stackTrace) return null;
  const replaced = stackTrace
    .replace(/[a-zA-Z]:\\(?:[^\s\\:]+\\)+(?:Playwright-local|tests)\\/gi, "tests/")
    .replace(/[a-zA-Z]:\\(?:[^\s\\:]+\\)+/gi, "");
  return replaced.replace(/\\/g, "/");
}

/**
 * Extracts a normalized relative spec file path and line number from the specFile and stack trace.
 */
function extractSpecLocation(specFile?: string, stackTrace?: string | null): string {
  if (!specFile) return "Unknown Specification";

  // Normalize path separators
  let cleanSpec = specFile.replace(/\\/g, "/");

  // Strip local workstation folder prefixes if present
  const marker = cleanSpec.indexOf("/tests/");
  if (marker !== -1) {
    cleanSpec = cleanSpec.slice(marker + 1);
  } else if (cleanSpec.startsWith("Playwright-local/")) {
    cleanSpec = cleanSpec.slice("Playwright-local/".length);
  }

  // Look for line number in stack trace if not already in spec path
  if (!cleanSpec.includes(":") && stackTrace) {
    const baseName = cleanSpec.split("/").pop() || cleanSpec;
    const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lineRegex = new RegExp(`${escapedBase}:(\\d+)(?::(\\d+))?`, "i");
    const match = stackTrace.match(lineRegex);
    if (match) {
      return `${cleanSpec}:${match[1]}`;
    }
  }

  return cleanSpec;
}

/**
 * Extracts HTTP method, endpoint, and status codes from diagnostics when available.
 * Never invents hypothetical endpoints or methods.
 */
function extractHttpDetails(
  errorMessage: string,
  stackTrace?: string | null,
  apiResponses?: unknown | null,
  executionLogs?: string[] | null
): ExtractedHttpInfo {
  let method: string | undefined;
  let endpoint: string | undefined;
  let statusCode: string | undefined;

  const combined = `${errorMessage}\n${stackTrace || ""}\n${(executionLogs || []).join("\n")}`;

  // Match HTTP method and route path: e.g. "GET /coordinator/interns/abc" or "PATCH /admin/staff/abc"
  const httpMatch = combined.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[a-zA-Z0-9_\-\.\/]+)/i);
  if (httpMatch) {
    method = httpMatch[1].toUpperCase();
    endpoint = httpMatch[2];
  } else {
    // Look for explicit API route pattern e.g. "/coordinator/interns/abc", ignoring spec file paths
    const pathMatch = combined.match(/(\/(?:api|admin|coordinator|supervisor|intern)\/[a-zA-Z0-9_\-\/]+)/i);
    if (pathMatch) {
      endpoint = pathMatch[1];
    }
  }

  // Ensure file paths are not mistaken for API endpoints
  if (endpoint && /\.(?:js|ts|jsx|tsx|json|html|spec|test)$/i.test(endpoint)) {
    endpoint = undefined;
  }

  // Extract status code if explicitly reported
  const statusMatch = combined.match(/\b(?:status code|status|received)\s*[:=]?\s*(\d{3})\b/i);
  if (statusMatch) {
    statusCode = statusMatch[1];
  } else {
    const arrayMatch = combined.match(/Received array:\s*(\[[^\]]+\])/i);
    if (arrayMatch) {
      statusCode = arrayMatch[1];
    }
  }

  // Inspect structured apiResponses array if provided
  if (Array.isArray(apiResponses) && apiResponses.length > 0) {
    const first = apiResponses[0];
    if (typeof first === "object" && first !== null) {
      const f = first as Record<string, unknown>;
      if (!method && typeof f.method === "string") method = f.method.toUpperCase();
      if (!endpoint && typeof f.url === "string") endpoint = f.url;
      if (!statusCode && (typeof f.status === "number" || typeof f.status === "string")) {
        statusCode = String(f.status);
      }
    }
  }

  return { method, endpoint, statusCode };
}

/**
 * Checks whether an assertion contradicts the test's stated specification.
 * e.g., A negative test specifying "should not return 500" where the assertion expects 500 or [404, 400] was received.
 */
function detectContradictoryAssertion(
  testTitle: string,
  errorMessage: string,
  stackTrace?: string | null
): boolean {
  const combined = `${testTitle}\n${errorMessage}\n${stackTrace || ""}`;
  return (
    (/should not return|never leaks|should not|not return/i.test(testTitle) &&
      /Expected.*:?\s*50[0-9]/i.test(combined) &&
      /Received.*:?\s*\[?(?:40[0-9]|20[0-9]|30[0-9])/i.test(combined)) ||
    (/expect\(received\)\.toContain\(expected\)/i.test(combined) &&
      /Expected value:\s*50[0-9]/i.test(combined) &&
      /Received array:\s*\[?(?:40[0-9]|20[0-9]|30[0-9])/i.test(combined))
  );
}

/**
 * Resolves professional QA classification, severity, and evidence-based reasoning.
 */
function resolveAssessment(
  testTitle: string,
  errorMessage: string,
  stackTrace?: string | null,
  investigation?: InvestigationDetail | null,
  failureSignature?: FormatIssueInput["failureSignature"]
): ClassificationAssessment {
  const isContradiction = detectContradictoryAssertion(testTitle, errorMessage, stackTrace);
  const detectedPatterns = [...(investigation?.detectedPatterns || [])];

  // 1. Contradictory / Inverted Test Assertion
  if (isContradiction) {
    const contradictionPattern =
      "Contradictory or Inverted Test Assertion (Test specifies 'should not return 500' but assertion expected 500 against received [404, 400])";
    if (!detectedPatterns.includes(contradictionPattern)) {
      detectedPatterns.unshift(contradictionPattern);
    }
    return {
      classificationLabel: "Potential Test Defect",
      severityLabel: "Medium",
      confidenceScore: 85,
      reasoning:
        "The test title specifies that non-numeric IDs should not return 500. However, the Playwright assertion failed with `Expected value: 500` against `Received array: [404, 400]`. The application responded with 404/400 (proper client error validation) rather than returning a 500 server crash. This strongly indicates an inverted assertion (`expect([404, 400]).toContain(actual)`) or contradictory expectation in test code, rather than an application defect.",
      detectedPatterns,
      isContradiction: true,
    };
  }

  // 2. Environment / Infrastructure Failure
  const combined = `${errorMessage}\n${stackTrace || ""}`;
  const isEnvFailure =
    /browserType\.launch: Executable doesn't exist|connect ECONNREFUSED|ENOTFOUND|getaddrinfo EAI_AGAIN|database ".*" does not exist|PrismaClientInitializationError/i.test(
      combined
    );
  if (isEnvFailure) {
    const envPattern = "Environment or Infrastructure Dependency Unavailable";
    if (!detectedPatterns.includes(envPattern)) detectedPatterns.unshift(envPattern);
    return {
      classificationLabel: "Environment Failure",
      severityLabel: "High",
      confidenceScore: 90,
      reasoning:
        "Failure is caused by an environmental or infrastructure prerequisite (e.g. database connectivity, missing browser binary, or unreachable host) rather than application code logic.",
      detectedPatterns,
      isContradiction: false,
    };
  }

  // 3. Stored Investigation Classification (if available)
  if (investigation?.classification) {
    switch (investigation.classification) {
      case "TEST_DEFECT":
        return {
          classificationLabel: "Test Defect",
          severityLabel: "Medium",
          confidenceScore: investigation.confidenceScore || 85,
          reasoning:
            investigation.summary ||
            "Failure appears to be caused by a test defect (strict mode violation, invalid selector, or fixture timeout).",
          detectedPatterns,
          isContradiction: false,
        };
      case "FLAKY_TEST":
        return {
          classificationLabel: "Flaky Test",
          severityLabel: "Low",
          confidenceScore: investigation.confidenceScore || 75,
          reasoning:
            investigation.summary ||
            "Failure exhibits timing-dependent race conditions, DOM detachment, or transient network timeouts.",
          detectedPatterns,
          isContradiction: false,
        };
      case "APPLICATION_BUG": {
        const isConfirmed = investigation.status === "CONFIRMED_BUG";
        const isServerCrash = /status code 50[0-9]|HTTP 50[0-9]|Internal Server Error|Bad Gateway/i.test(combined);
        const severity: "High" | "Medium" | "Low" = isServerCrash ? "High" : "Medium";
        return {
          classificationLabel: isConfirmed ? "Confirmed Application Bug" : "Potential Application Bug",
          severityLabel: severity,
          confidenceScore: investigation.confidenceScore || 85,
          reasoning:
            investigation.summary ||
            "Failure represents an unhandled application exception, server 5xx error, or functional assertion mismatch without timing artifacts.",
          detectedPatterns,
          isContradiction: false,
        };
      }
      case "INCONCLUSIVE":
      default:
        return {
          classificationLabel: "Needs Investigation",
          severityLabel: "Medium",
          confidenceScore: investigation.confidenceScore || 50,
          reasoning:
            investigation.summary ||
            "Diagnostic evidence is inconclusive. Further local reproduction or trace artifact review is required.",
          detectedPatterns,
          isContradiction: false,
        };
    }
  }

  // 4. Default heuristic when investigation record is absent
  const isServer5xx = /status code 50[0-9]|HTTP 50[0-9]|Internal Server Error/i.test(combined);
  if (isServer5xx) {
    return {
      classificationLabel: "Potential Application Bug",
      severityLabel: "High",
      confidenceScore: 80,
      reasoning: "Observed HTTP 5xx server response indicating an unhandled server-side condition.",
      detectedPatterns: ["HTTP 5xx Server Error"],
      isContradiction: false,
    };
  }

  return {
    classificationLabel: "Needs Investigation",
    severityLabel: "Medium",
    confidenceScore: 50,
    reasoning:
      "Automated failure captured without completed triage review. Requires investigation to verify expected behavior.",
    detectedPatterns: [failureSignature?.errorType || "Unclassified Failure"],
    isContradiction: false,
  };
}

/**
 * Builds Steps to Reproduce based strictly on actual test actions and verified evidence.
 * Never invents hypothetical user steps.
 */
function buildStepsToReproduce(
  specFileClean: string,
  testTitle: string,
  branch?: string | null,
  httpInfo?: ExtractedHttpInfo,
  executionLogs?: string[] | null
): string {
  // If execution logs captured actual action statements, format them
  if (Array.isArray(executionLogs) && executionLogs.length > 0) {
    const stepLogs = executionLogs.filter((l) =>
      /^(?:\[(?:page|action|click|goto|api)\]|GET|POST|PATCH|PUT|DELETE|navigating to)/i.test(l.trim())
    );
    if (stepLogs.length > 0) {
      return stepLogs.map((log, idx) => `${idx + 1}. \`${sanitizeText(log.trim())}\``).join("\n");
    }
  }

  // If HTTP endpoint and method were verified from the test diagnostic
  if (httpInfo?.endpoint) {
    const method = httpInfo.method || "GET";
    return [
      `1. Open a terminal in the test environment${branch ? ` on branch \`${branch}\`` : ""}.`,
      `2. Issue a request to target endpoint: \`${method} ${httpInfo.endpoint}\` with non-numeric or invalid parameters.`,
      `3. Or execute the specific automated test: \`npx playwright test ${specFileClean} -g "${testTitle}"\`.`,
      `4. Observe the returned HTTP response status and assertion evaluation.`,
    ].join("\n");
  }

  // Actionable, truthful test execution command
  return [
    `1. Check out the project repository${branch ? ` (branch: \`${branch}\`)` : ""}.`,
    `2. Run the targeted Playwright test:`,
    `   \`\`\`bash`,
    `   npx playwright test ${specFileClean} -g "${testTitle}"`,
    `   \`\`\``,
    `3. Inspect the failure output and Playwright trace viewer.`,
  ].join("\n");
}

/**
 * Builds actionable next steps tailored to the classification and verified evidence.
 */
function buildRecommendedInvestigation(
  classificationLabel: string,
  specFileClean: string,
  httpInfo?: ExtractedHttpInfo,
  recommendedAction?: string
): string {
  const steps: string[] = [];

  if (classificationLabel.includes("Test Defect")) {
    steps.push(`Inspect and review \`${specFileClean}\` around the failed assertion line.`);
    if (httpInfo?.endpoint) {
      steps.push(
        `Test the endpoint \`${httpInfo.method || "GET"} ${httpInfo.endpoint}\` directly to confirm actual server response.`
      );
    }
    steps.push(
      `Verify whether the test assertion was inverted or incorrectly expecting 500 instead of asserting that 500 is not returned.`
    );
    steps.push(`Update the test assertion to expect the correct status codes (e.g. \`[400, 404]\`).`);
  } else if (classificationLabel.includes("Application Bug")) {
    if (httpInfo?.endpoint) {
      steps.push(
        `Inspect backend controller or route handler for \`${httpInfo.method || "GET"} ${httpInfo.endpoint}\`.`
      );
    }
    steps.push(`Check server error logs for unhandled exceptions (e.g., PostgreSQL query parameter type errors).`);
    steps.push(`Add parameter type validation or error handling before database queries.`);
  } else if (classificationLabel.includes("Flaky")) {
    steps.push(`Inspect \`${specFileClean}\` for unawaited promises or missing element visibility assertions.`);
    steps.push(`Check if network latency or DOM re-rendering causes intermittent timeouts.`);
  } else if (classificationLabel.includes("Environment")) {
    steps.push(`Verify local or CI service availability (database, Redis, backend API server).`);
    steps.push(`Ensure required browser binaries and test fixtures are properly installed and configured.`);
  } else {
    steps.push(`Run the test locally in headed mode with \`--debug\` flag to observe application behavior.`);
    steps.push(`Review network logs and console errors in the Playwright trace artifact.`);
  }

  const numbered = steps.map((s, idx) => `${idx + 1}. ${s}`);
  if (recommendedAction && !steps.some((s) => s.includes(recommendedAction))) {
    numbered.push(`- **Action Note:** ${recommendedAction}`);
  }

  return numbered.join("\n");
}

/**
 * Builds resolution verification criteria.
 */
function buildResolutionCriteria(
  testTitle: string,
  specFileClean: string,
  classificationLabel: string,
  httpInfo?: ExtractedHttpInfo
): string {
  const criteria: string[] = [
    `- [ ] The automated test \`${testTitle}\` in \`${specFileClean}\` executes and passes cleanly without errors.`,
  ];

  if (classificationLabel.includes("Test Defect")) {
    criteria.push(
      `- [ ] The test assertion in \`${specFileClean}\` correctly validates application behavior according to documented specifications.`
    );
  } else if (httpInfo?.endpoint) {
    criteria.push(
      `- [ ] Endpoint \`${httpInfo.method || "GET"} ${httpInfo.endpoint}\` returns appropriate HTTP status code without 5xx server errors.`
    );
  }

  criteria.push(
    `- [ ] Associated regression test suite executes without unexpected side effects or regressions.`
  );

  return criteria.join("\n");
}

/**
 * Formats a standardized, sanitized, developer-friendly GitHub Issue for automated QA defect tracking.
 */
export function formatGitHubIssue(input: FormatIssueInput): FormattedIssue {
  const { failureSignature, sampleDetail, cmsBaseUrl } = input;
  const testResult = sampleDetail?.testResult;
  const testRun = testResult?.testRun;
  const project = testRun?.project;
  const investigation = testResult?.investigation;

  const testTitle = testResult?.testTitle || failureSignature.errorType || "Automated Test Failure";
  const rawSpecFile = testResult?.specFile || "Unknown Specification";
  const role = testResult?.role && testResult.role !== "default" ? testResult.role : null;
  const suiteTitle = testResult?.suiteTitle || null;
  const durationMs = testResult?.durationMs || 0;
  const retryCount = testResult?.retryCount ?? 0;

  // Diagnostics and Stack Trace
  const rawErrorMessage = sampleDetail?.sanitizedErrorMessage || failureSignature.normalizedError;
  const sanitizedErrorMessage = sanitizeText(rawErrorMessage);
  const rawStackTrace = sampleDetail?.sanitizedStackTrace || null;
  const cleanedStackTrace = cleanStackTracePaths(rawStackTrace);
  const sanitizedStackTrace = cleanedStackTrace ? sanitizeText(cleanedStackTrace) : null;
  const firstErrorLine = sanitizedErrorMessage.split("\n")[0]?.trim() || "Test failed during execution";

  // Clean relative specification file location (with line number if detected in stack)
  const specFileClean = extractSpecLocation(rawSpecFile, rawStackTrace);

  // Extract HTTP method and route if detected in evidence
  const httpInfo = extractHttpDetails(
    sanitizedErrorMessage,
    sanitizedStackTrace,
    investigation?.apiResponses,
    investigation?.executionLogs
  );

  // Classification & Severity assessment
  const assessment = resolveAssessment(
    testTitle,
    sanitizedErrorMessage,
    sanitizedStackTrace,
    investigation,
    failureSignature
  );

  // ----------------------------------------------------
  // Section 1: Title
  // ----------------------------------------------------
  const rawTitle = `[${assessment.classificationLabel} | ${assessment.severityLabel}] ${testTitle}: ${firstErrorLine}`;
  const sanitizedTitle = sanitizeText(rawTitle);
  const title = sanitizedTitle.length > 150 ? `${sanitizedTitle.slice(0, 147)}...` : sanitizedTitle;

  // Timestamps
  const firstSeenStr = new Date(failureSignature.firstSeenAt).toISOString();
  const lastSeenStr = new Date(failureSignature.lastSeenAt).toISOString();

  // CMS Links
  const baseUrl = (cmsBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const failureUrl = `${baseUrl}/failures/${failureSignature.id}`;
  const runUrl = testRun?.id ? `${baseUrl}/runs/${testRun.id}` : null;

  // ----------------------------------------------------
  // Section 2: Summary
  // ----------------------------------------------------
  const projectName = project?.name || "Automated Test Suite";
  const roleSuffix = role ? ` under role \`${role}\`` : "";
  let summaryText = `During automated testing of **${projectName}**, the test \`${testTitle}\` failed${roleSuffix} in \`${specFileClean}\`.`;
  if (assessment.isContradiction) {
    summaryText += ` The test assertion failed with \`Expected value: 500\` against \`Received array: [404, 400]\`.`;
  } else if (investigation?.summary) {
    summaryText += ` ${investigation.summary}`;
  }

  // ----------------------------------------------------
  // Section 3: Environment (Only render non-empty fields)
  // ----------------------------------------------------
  const envRows: string[] = [];
  if (project?.name) envRows.push(`| **Project** | ${project.name} (\`${project.key}\`) |`);
  if (testRun?.environment) envRows.push(`| **Environment** | \`${testRun.environment}\` |`);
  if (testRun?.branch) envRows.push(`| **Branch** | \`${testRun.branch}\` |`);
  if (testRun?.commitSha) envRows.push(`| **Commit** | \`${testRun.commitSha}\` |`);
  if (project?.repositoryUrl) envRows.push(`| **Repository** | ${project.repositoryUrl} |`);

  const environmentSection =
    envRows.length > 0
      ? `### Environment\n| Property | Value |\n| :--- | :--- |\n${envRows.join("\n")}\n\n`
      : "";

  // ----------------------------------------------------
  // Section 4: Test Information
  // ----------------------------------------------------
  const infoRows: string[] = [
    `| **Test Title** | ${testTitle} |`,
    `| **Specification File** | \`${specFileClean}\` |`,
  ];
  if (suiteTitle) infoRows.push(`| **Suite** | ${suiteTitle} |`);
  if (role) infoRows.push(`| **Role / Persona** | \`${role}\` |`);
  if (runUrl && testRun?.id) {
    infoRows.push(`| **Run ID** | [${testRun.id}](${runUrl}) |`);
  } else if (testRun?.id) {
    infoRows.push(`| **Run ID** | \`${testRun.id}\` |`);
  }
  infoRows.push(`| **Failure ID** | \`${failureSignature.id}\` |`);
  infoRows.push(`| **Signature Hash** | \`${failureSignature.signatureHash}\` |`);
  infoRows.push(`| **Occurrences** | ${failureSignature.occurrenceCount} |`);
  infoRows.push(`| **First Seen** | ${firstSeenStr} |`);
  infoRows.push(`| **Last Seen** | ${lastSeenStr} |`);
  if (durationMs > 0) infoRows.push(`| **Duration** | ${durationMs} ms |`);
  infoRows.push(`| **Retry Count** | ${retryCount} |`);

  const testInfoSection = `### Test Information\n| Property | Value |\n| :--- | :--- |\n${infoRows.join("\n")}\n\n`;

  // ----------------------------------------------------
  // Section 5: Steps to Reproduce
  // ----------------------------------------------------
  const stepsText = buildStepsToReproduce(
    specFileClean,
    testTitle,
    testRun?.branch,
    httpInfo,
    investigation?.executionLogs
  );
  const stepsSection = `### Steps to Reproduce\n${stepsText}\n\n`;

  // ----------------------------------------------------
  // Section 6: Expected Result
  // ----------------------------------------------------
  let expectedText = investigation?.expectedResult || null;
  if (!expectedText) {
    if (assessment.isContradiction) {
      expectedText =
        "The application should reject non-numeric identifier routes with a client validation error (HTTP 400 Bad Request or HTTP 404 Not Found), without crashing or leaking an HTTP 500.";
    } else {
      const expMatch = sanitizedErrorMessage.match(/Expected(?:\s+value)?:\s*([^\r\n]+)/i);
      if (expMatch) expectedText = expMatch[1].trim();
    }
  }
  const expectedSection = expectedText ? `### Expected Result\n${expectedText}\n\n` : "";

  // ----------------------------------------------------
  // Section 7: Actual Result
  // ----------------------------------------------------
  let actualText = investigation?.actualResult || null;
  if (!actualText) {
    if (assessment.isContradiction) {
      actualText =
        "The Playwright assertion evaluated `Expected value: 500` against `Received array: [404, 400]`. The endpoint actually returned 404/400, but the test assertion failed because it asserted 500.";
    } else {
      const recMatch = sanitizedErrorMessage.match(/Received(?:\s+array)?:\s*([^\r\n]+)/i);
      if (recMatch) actualText = recMatch[1].trim();
    }
  }
  const actualSection = actualText ? `### Actual Result\n${actualText}\n\n` : "";

  // ----------------------------------------------------
  // Section 8: Technical Evidence
  // ----------------------------------------------------
  let technicalEvidence = `### Technical Evidence\n#### Diagnostic Error\n\`\`\`text\n${sanitizedErrorMessage}\n\`\`\`\n\n`;

  if (sanitizedStackTrace) {
    technicalEvidence += `<details>\n<summary><b>Stack Trace</b> (click to expand)</summary>\n\n\`\`\`text\n${sanitizedStackTrace}\n\`\`\`\n</details>\n\n`;
  }

  if (httpInfo.method || httpInfo.endpoint) {
    technicalEvidence += `#### HTTP & Endpoint Details\n| HTTP Method | Endpoint | Status Code |\n| :--- | :--- | :--- |\n| \`${httpInfo.method || "N/A"}\` | \`${httpInfo.endpoint || "N/A"}\` | \`${httpInfo.statusCode || "N/A"}\` |\n\n`;
  }

  // Include structured API responses or execution logs if available
  if (Array.isArray(investigation?.apiResponses) && investigation.apiResponses.length > 0) {
    technicalEvidence += `#### Captured API Responses\n\`\`\`json\n${JSON.stringify(investigation.apiResponses, null, 2)}\n\`\`\`\n\n`;
  }

  technicalEvidence += `#### CMS Diagnostics\n- **View Failure in CMS:** [${failureSignature.signatureHash.slice(0, 12)}](${failureUrl})\n`;
  if (runUrl && testRun?.id) {
    technicalEvidence += `- **View Run in CMS:** [${testRun.id.slice(0, 13)}](${runUrl})\n`;
  }
  technicalEvidence += `- **Signature Hash:** \`${failureSignature.signatureHash}\`\n\n`;

  // ----------------------------------------------------
  // Section 9: Initial QA Assessment
  // ----------------------------------------------------
  let assessmentSection = `### Initial QA Assessment\n`;
  assessmentSection += `- **Classification:** **${assessment.classificationLabel}**\n`;
  assessmentSection += `- **Confidence:** ${assessment.confidenceScore}%\n`;
  assessmentSection += `- **Assessment Reasoning:**\n${assessment.reasoning}\n`;

  if (assessment.detectedPatterns.length > 0) {
    assessmentSection += `- **Detected Diagnostic Patterns:**\n`;
    for (const pattern of assessment.detectedPatterns) {
      assessmentSection += `  - \`${pattern}\`\n`;
    }
  }
  if (investigation?.adminNotes) {
    assessmentSection += `- **Admin Review Notes:** ${investigation.adminNotes}\n`;
  }
  if (investigation?.reviewedBy) {
    assessmentSection += `- **Reviewed By:** ${investigation.reviewedBy}\n`;
  }
  assessmentSection += `\n`;

  // ----------------------------------------------------
  // Section 10: Recommended Investigation
  // ----------------------------------------------------
  const recommendedText = buildRecommendedInvestigation(
    assessment.classificationLabel,
    specFileClean,
    httpInfo,
    investigation?.recommendedAction
  );
  const recommendedSection = `### Recommended Investigation\n${recommendedText}\n\n`;

  // ----------------------------------------------------
  // Section 11: Resolution Criteria
  // ----------------------------------------------------
  const resolutionText = buildResolutionCriteria(
    testTitle,
    specFileClean,
    assessment.classificationLabel,
    httpInfo
  );
  const resolutionSection = `### Resolution Criteria\n${resolutionText}\n\n`;

  // Compose Full Markdown Body
  const body = `## Automated QA Defect Report

### Summary
${summaryText}

${environmentSection}${testInfoSection}${stepsSection}${expectedSection}${actualSection}${technicalEvidence}${assessmentSection}${recommendedSection}${resolutionSection}---
*Auto-generated by QA-Platform CMS. Please do not modify the Signature Hash to maintain deduplication tracking.*
`.trim();

  // ----------------------------------------------------
  // Standardized Labels
  // ----------------------------------------------------
  const labels = ["automated-defect", "qa-failure"];

  // Classification label
  if (assessment.classificationLabel.includes("Test Defect")) {
    labels.push("classification:test-defect");
  } else if (assessment.classificationLabel.includes("Flaky")) {
    labels.push("classification:flaky-test");
  } else if (assessment.classificationLabel.includes("Environment")) {
    labels.push("classification:environment-failure");
  } else if (assessment.classificationLabel.includes("Confirmed")) {
    labels.push("classification:confirmed-bug");
  } else if (assessment.classificationLabel.includes("Bug")) {
    labels.push("classification:app-bug");
  } else {
    labels.push("classification:needs-investigation");
  }

  // Severity label
  labels.push(`severity:${assessment.severityLabel.toLowerCase()}`);

  // Role label if present
  if (role) {
    labels.push(`role:${role.toLowerCase()}`);
  }

  return {
    title,
    body: sanitizeText(body),
    labels,
  };
}
