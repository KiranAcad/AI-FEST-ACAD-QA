/**
 * Shared type definitions for the AI Failure Analysis Copilot.
 *
 * These types define the data contract between all modules:
 * parser → context builder → LLM analyzer → report generator
 */

// ─── Root Cause Taxonomy ────────────────────────────────────────────────────

/** Fixed set of root cause categories for failure classification. */
export type RootCauseCategory =
  | 'Locator/Selector Issue'
  | 'Timing/Sync Issue'
  | 'Test Data Issue'
  | 'Environment/Infra Issue'
  | 'Application Bug'
  | 'Test Script Bug'
  | 'Unknown/Needs Manual Review';

/** All valid root cause categories as an array, useful for validation. */
export const ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'Locator/Selector Issue',
  'Timing/Sync Issue',
  'Test Data Issue',
  'Environment/Infra Issue',
  'Application Bug',
  'Test Script Bug',
  'Unknown/Needs Manual Review',
];

/** Confidence level for the LLM's classification. */
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

// ─── Parser Output ──────────────────────────────────────────────────────────

/** A single parsed failure extracted from test results. */
export interface ParsedFailure {
  /** Full test name (e.g., "Login > should submit valid credentials") */
  testName: string;
  /** Parent suite/describe block name */
  suiteName: string;
  /** Path to the test file */
  filePath: string;
  /** Primary error message */
  errorMessage: string;
  /** Full stack trace (may be trimmed downstream) */
  stackTrace: string;
  /** Last N log/stdout lines before failure */
  logLines: string[];
  /** Path to failure screenshot, if captured */
  screenshotPath?: string;
  /** Path to test video recording, if captured */
  videoPath?: string;
  /** Test execution duration in milliseconds */
  duration: number;
  /** Number of retry attempts */
  retries: number;
}

// ─── LLM Analysis Output ────────────────────────────────────────────────────

/** LLM analysis result for a single failed test. */
export interface FailureAnalysis {
  /** Test name (echoed back for correlation) */
  testName: string;
  /** Classified root cause category */
  category: RootCauseCategory;
  /** Confidence in the classification */
  confidence: ConfidenceLevel;
  /** Human-readable explanation of why this category was chosen */
  explanation: string;
  /** Suggested next action for the QA engineer */
  suggestedAction: string;
  /** Most relevant excerpt from the logs/stack trace */
  relevantLogExcerpt: string;
}

// ─── Report ─────────────────────────────────────────────────────────────────

/** Token usage tracking for cost estimation. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

/** Complete analysis report for a batch of failures. */
export interface AnalysisReport {
  /** ISO timestamp of when the analysis was run */
  timestamp: string;
  /** Path to the input file/directory that was analyzed */
  inputPath: string;
  /** Total number of tests in the run (passed + failed) */
  totalTests: number;
  /** Number of failed tests that were analyzed */
  totalFailures: number;
  /** Per-failure analysis results */
  analyses: FailureAnalysis[];
  /** Aggregate token usage and cost */
  tokenUsage: TokenUsage;
}

// ─── LLM Provider ───────────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'ollama';

// ─── CLI Options ────────────────────────────────────────────────────────────

/** CLI command options. */
export interface AnalyzeOptions {
  input: string;
  output: string;
  format: 'md' | 'html' | 'both';
  model?: string;
  provider?: LLMProvider;
  ollamaUrl?: string;
}

