import { FailureAnalyzer } from "./types";
import { RuleBasedFailureAnalyzer } from "./rule-engine";

export * from "./types";
export * from "./rule-engine";

let activeAnalyzer: FailureAnalyzer = new RuleBasedFailureAnalyzer();

/**
 * Returns the currently configured FailureAnalyzer instance.
 * Defaults to the deterministic RuleBasedFailureAnalyzer.
 */
export function getFailureAnalyzer(): FailureAnalyzer {
  return activeAnalyzer;
}

/**
 * Allows swapping the failure analyzer (e.g. for testing or future LLM integration).
 */
export function setFailureAnalyzer(analyzer: FailureAnalyzer): void {
  activeAnalyzer = analyzer;
}
