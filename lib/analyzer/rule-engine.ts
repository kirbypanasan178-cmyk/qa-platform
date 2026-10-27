import {
  FailureAnalyzer,
  FailureEvidence,
  AnalysisResult,
  InvestigationClassification,
} from "./types";

export class RuleBasedFailureAnalyzer implements FailureAnalyzer {
  readonly name = "RuleBasedFailureAnalyzer";

  analyze(evidence: FailureEvidence): AnalysisResult {
    const errorText = `${evidence.errorMessage || ""} ${evidence.stackTrace || ""}`.trim();
    const logsText = (evidence.executionLogs || []).join("\n");
    const combinedText = `${errorText}\n${logsText}`;

    const detectedPatterns: string[] = [];

    // Check API responses for 5xx status codes
    const hasApi5xx = (evidence.apiResponses || []).some((res: unknown) => {
      if (typeof res === "object" && res !== null && "status" in res) {
        const status = Number((res as { status: unknown }).status);
        return status >= 500 && status < 600;
      }
      return false;
    });

    // ----------------------------------------------------
    // Category 1: Possible Test Defect (TEST_DEFECT)
    // ----------------------------------------------------
    const strictModeMatch = /strict mode violation|resolved to \d+ elements/i.test(combinedText);
    const invalidSelectorMatch = /is not a valid selector|DOMException.*Failed to execute 'querySelector'|unexpected token.*in selector|SyntaxError: Failed to execute/i.test(combinedText);
    const fixtureHookMatch = /beforeAll hook timeout|beforeEach hook timeout|afterAll hook timeout|afterEach hook timeout|fixture .* failed|Test timeout of \d+ms exceeded while setting up/i.test(combinedText);
    const missingFixtureLaunch = /browserType\.launch: Executable doesn't exist|Cannot read properties of undefined \(reading 'goto'\)/i.test(combinedText);

    if (strictModeMatch) detectedPatterns.push("Playwright Strict Mode Violation (Multiple matching elements found)");
    if (invalidSelectorMatch) detectedPatterns.push("Invalid or Malformed DOM Selector Syntax");
    if (fixtureHookMatch) detectedPatterns.push("Test Hook or Fixture Setup Timeout/Failure");
    if (missingFixtureLaunch) detectedPatterns.push("Missing Environment Browser/Fixture Configuration");

    if (detectedPatterns.length > 0) {
      return {
        classification: "TEST_DEFECT",
        confidenceScore: strictModeMatch || invalidSelectorMatch ? 90 : 85,
        summary: `Failure appears to be caused by a test defect: ${detectedPatterns.join(", ")}.`,
        recommendedAction: strictModeMatch
          ? "Update the test locator to uniquely target a single element or use `.first()` / `.filter()`."
          : invalidSelectorMatch
          ? "Correct the CSS/XPath selector syntax in the spec file."
          : "Verify test fixtures, hook prerequisites, and test runner environment configuration.",
        detectedPatterns,
      };
    }

    // ----------------------------------------------------
    // Category 2: Race Condition / Timing / Network Signals
    // ----------------------------------------------------
    const domDetachMatch = /element is not attached to the DOM|Target page, context or browser has been closed|Execution context was destroyed|frame was detached/i.test(combinedText);
    const raceWaitMatch = /waiting for locator\('?[^']+'?\)( to be (visible|hidden|enabled))?|page\.waitForResponse.*timeout|locator\.waitFor.*timeout|navigating to ".*", waiting until "load"/i.test(combinedText);
    const networkSocketMatch = /ECONNRESET|ETIMEDOUT|ERR_CONNECTION_REFUSED|fetch failed|socket hang up/i.test(combinedText);

    if (domDetachMatch) detectedPatterns.push("DOM Element Detachment / Browser Context Closed during Action");
    if (raceWaitMatch) detectedPatterns.push("Asynchronous Race Condition or Visibility Wait Timeout");
    if (networkSocketMatch) detectedPatterns.push("Transient Socket / Network Reset (ECONNRESET / ETIMEDOUT)");

    const hasTimingOrRaceSignals = detectedPatterns.length > 0;

    // ----------------------------------------------------
    // Category 3: Likely Application Bug (APPLICATION_BUG)
    // ----------------------------------------------------
    const server5xxMatch = hasApi5xx || /status code 50[0-9]|HTTP 50[0-9]|Internal Server Error|Bad Gateway|Service Unavailable|Server Error \(500\)/i.test(combinedText);
    const clientCrashMatch = /TypeError: Cannot read properties of (undefined|null)|ReferenceError: .* is not defined|Uncaught \(in promise\)|ChunkLoadError|Application error: a client-side exception has occurred/i.test(combinedText);
    const assertionMatch = evidence.errorType === "AssertionError" || /expect\(received\)\.to|AssertionError|expected.*received|toEqual|toHaveText|toHaveValue/i.test(combinedText);

    // If explicit server 5xx or client crash, strongly indicates an application bug
    if (server5xxMatch || clientCrashMatch) {
      if (server5xxMatch) detectedPatterns.push("Backend HTTP 5xx Server Error or Crash");
      if (clientCrashMatch) detectedPatterns.push("Unhandled Client-Side Application Exception (TypeError/ReferenceError)");

      return {
        classification: "APPLICATION_BUG",
        confidenceScore: 92,
        summary: `Identified application crash or server failure: ${detectedPatterns.join(", ")}.`,
        recommendedAction: "Confirm bug and notify the development team with the backend/client stack trace.",
        detectedPatterns,
      };
    }

    // Functional assertion failure without timing or race condition
    if (assertionMatch && !hasTimingOrRaceSignals) {
      // Adhering to Requirement 5: "Do not treat every failed test as a real bug. A passing retry does not automatically prove that a failure was flaky."
      if (evidence.retryCount > 0) {
        detectedPatterns.push(
          `Assertion failure observed with ${evidence.retryCount} retries, without explicit timing/DOM artifacts`
        );
        return {
          classification: "INCONCLUSIVE",
          confidenceScore: 50,
          summary:
            "Test failed with an assertion mismatch across retries without explicit timing artifacts. Passing retry alone does not confirm flakiness, and unconfirmed retries should not be treated as a definitive bug.",
          recommendedAction:
            "Investigate failure context and replay test locally to determine if the failure represents an intermittent bug or an environmental variance.",
          detectedPatterns,
        };
      }

      detectedPatterns.push("Functional Assertion Mismatch (Expected business logic state differed from actual UI state)");

      // Check if recurring
      if (evidence.historicalOccurrences && evidence.historicalOccurrences > 1) {
        detectedPatterns.push(`Recurring failure observed across ${evidence.historicalOccurrences} test runs`);
      }

      return {
        classification: "APPLICATION_BUG",
        confidenceScore: 88,
        summary: "Functional assertion failure without timing artifacts. Application rendered unexpected state.",
        recommendedAction: "Confirm bug and verify if recent code changes altered expected business rules.",
        detectedPatterns,
      };
    }

    // ----------------------------------------------------
    // Category 4: Flaky Test Evaluation (Adhering strictly to Req 5)
    // "A passing retry does not automatically prove that a failure was flaky."
    // ----------------------------------------------------
    if (hasTimingOrRaceSignals) {
      // We have explicit race/DOM signals
      const confidence = evidence.retryCount > 0 ? 86 : 74;
      return {
        classification: "FLAKY_TEST",
        confidenceScore: confidence,
        summary: `Possible flaky test due to asynchronous timing or network instability: ${detectedPatterns.join(", ")}.`,
        recommendedAction: "Add explicit element assertions, stabilize network waits, or increase locator timeout thresholds.",
        detectedPatterns,
      };
    }

    // If retryCount > 0, but NO timing or race signals were found:
    if (evidence.retryCount > 0) {
      detectedPatterns.push(`Test passed or was retried (${evidence.retryCount} retries) without explicit timing/DOM detachment artifacts`);
      return {
        classification: "INCONCLUSIVE",
        confidenceScore: 45,
        summary: "Test exhibited retry behavior, but no explicit race condition or locator timing artifact was found. Passing retry alone does not confirm flakiness.",
        recommendedAction: "Review full trace log or perform rerun to determine if intermittency is caused by an environmental race or a sporadic bug.",
        detectedPatterns,
      };
    }

    // ----------------------------------------------------
    // Category 5: Inconclusive (INCONCLUSIVE)
    // ----------------------------------------------------
    const genericTimeout = /Timeout \d+ms exceeded/i.test(combinedText);
    if (genericTimeout) {
      detectedPatterns.push("Generic Execution Timeout without specific DOM or console diagnostic logs");
    } else {
      detectedPatterns.push("Sparse or unclassified failure signature");
    }

    return {
      classification: "INCONCLUSIVE",
      confidenceScore: 40,
      summary: "Insufficient diagnostic evidence to definitively classify this failure as an application bug, test defect, or flaky test.",
      recommendedAction: "Examine Playwright trace artifacts, inspect network traffic logs, or run test locally with headed mode.",
      detectedPatterns,
    };
  }
}
