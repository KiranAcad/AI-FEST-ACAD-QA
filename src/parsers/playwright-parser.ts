/**
 * Playwright JSON Reporter Parser
 *
 * Parses the output of Playwright's built-in JSON reporter (`--reporter=json`)
 * and extracts structured failure information for each failed test.
 *
 * The Playwright JSON format uses a nested suite hierarchy:
 *   report.suites[] → suite.suites[] → suite.specs[] → spec.tests[] → test.results[]
 */

import { readFile } from 'node:fs/promises';
import { ParsedFailure } from '../types.js';

/**
 * Strip ANSI escape codes from strings.
 * Playwright's JSON reporter embeds color codes in error messages.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Playwright JSON Report Types ───────────────────────────────────────────
// These mirror the runtime shape of Playwright's JSON reporter output.
// Not exhaustive — only the fields we need for failure extraction.

interface PlaywrightAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

interface PlaywrightError {
  message?: string;
  stack?: string;
  value?: string;
}

interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  error?: PlaywrightError;
  errors?: PlaywrightError[];
  attachments?: PlaywrightAttachment[];
  stdout?: Array<string | { text?: string }>;
  stderr?: Array<string | { text?: string }>;
  retry: number;
}

interface PlaywrightTest {
  title: string;
  ok: boolean;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: PlaywrightTestResult[];
  expectedStatus: string;
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: PlaywrightTest[];
  file: string;
  line: number;
  column: number;
}

interface PlaywrightSuite {
  title: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
  file?: string;
}

interface PlaywrightReport {
  config: Record<string, unknown>;
  suites: PlaywrightSuite[];
  errors?: PlaywrightError[];
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
}

// ─── Parser Implementation ──────────────────────────────────────────────────

/**
 * Parse a Playwright JSON reporter output file and extract all failed tests.
 *
 * @param filePath - Absolute path to the Playwright JSON report file
 * @returns Array of parsed failures, one per failed test
 */
export async function parsePlaywrightResults(filePath: string): Promise<{
  failures: ParsedFailure[];
  totalTests: number;
}> {
  const raw = await readFile(filePath, 'utf-8');
  const report: PlaywrightReport = JSON.parse(raw);

  const failures: ParsedFailure[] = [];
  let totalTests = 0;

  // Recursively walk the suite hierarchy
  function walkSuite(suite: PlaywrightSuite, parentSuiteName: string): void {
    const currentSuiteName = parentSuiteName
      ? `${parentSuiteName} > ${suite.title}`
      : suite.title;

    // Process specs (leaf-level test containers)
    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          totalTests++;

          // Only process failed/unexpected and flaky tests
          if (test.status !== 'unexpected' && test.status !== 'flaky') {
            continue;
          }

          const failure = extractFailure(spec, test, currentSuiteName);
          if (failure) {
            failures.push(failure);
          }
        }
      }
    }

    // Recurse into nested suites
    if (suite.suites) {
      for (const childSuite of suite.suites) {
        walkSuite(childSuite, currentSuiteName);
      }
    }
  }

  for (const suite of report.suites) {
    walkSuite(suite, '');
  }

  return { failures, totalTests };
}

/**
 * Extract a ParsedFailure from a failed Playwright test.
 */
function extractFailure(
  spec: PlaywrightSpec,
  test: PlaywrightTest,
  suiteName: string
): ParsedFailure | null {
  // Use the last result (final retry attempt)
  const result = test.results[test.results.length - 1];
  if (!result) return null;

  // Extract error message and stack trace
  const { errorMessage, stackTrace } = extractErrorInfo(result);

  // Extract log lines from stdout/stderr
  const logLines = extractLogLines(result);

  // Extract screenshot and video paths from attachments
  const screenshotPath = findAttachment(result.attachments, 'screenshot');
  const videoPath = findAttachment(result.attachments, 'video');

  // Extract error location from spec or stack trace
  const errorLocation = {
    file: spec.file,
    line: spec.line || 1,
    column: spec.column,
  };

  return {
    testName: suiteName ? `${suiteName} > ${spec.title}` : spec.title,
    suiteName: suiteName || 'Root',
    filePath: spec.file,
    errorMessage,
    stackTrace: trimStackTrace(stackTrace),
    logLines: logLines.slice(-20), // Keep last 20 lines
    screenshotPath,
    videoPath,
    duration: result.duration,
    retries: test.results.length - 1, // Number of retries (first attempt is not a retry)
    errorLocation,
  };
}

/**
 * Extract error message and stack trace from a test result.
 */
function extractErrorInfo(result: PlaywrightTestResult): {
  errorMessage: string;
  stackTrace: string;
} {
  // Check result.errors[] first (array of errors), fall back to result.error
  const errors = result.errors?.length ? result.errors : result.error ? [result.error] : [];

  if (errors.length === 0) {
    return {
      errorMessage: `Test ${result.status} with no error details`,
      stackTrace: '',
    };
  }

  // Combine all error messages
  const messages: string[] = [];
  const stacks: string[] = [];

  for (const err of errors) {
    if (err.message) {
      messages.push(stripAnsi(err.message));
    } else if (err.value) {
      messages.push(stripAnsi(err.value));
    }
    if (err.stack) {
      stacks.push(stripAnsi(err.stack));
    }
  }

  return {
    errorMessage: messages.join('\n') || `Test ${result.status}`,
    stackTrace: stacks.join('\n---\n') || '',
  };
}

/**
 * Extract log lines from stdout and stderr.
 */
function extractLogLines(result: PlaywrightTestResult): string[] {
  const lines: string[] = [];

  const extractFromStream = (stream: Array<string | { text?: string }> | undefined) => {
    if (!stream) return;
    for (const entry of stream) {
      if (typeof entry === 'string') {
        lines.push(...entry.split('\n').filter(Boolean));
      } else if (entry.text) {
        lines.push(...entry.text.split('\n').filter(Boolean));
      }
    }
  };

  extractFromStream(result.stdout);
  extractFromStream(result.stderr);

  return lines;
}

/**
 * Find an attachment by name prefix (e.g., "screenshot", "video").
 */
function findAttachment(
  attachments: PlaywrightAttachment[] | undefined,
  namePrefix: string
): string | undefined {
  if (!attachments) return undefined;
  const attachment = attachments.find((a) => a.name.toLowerCase().startsWith(namePrefix));
  return attachment?.path;
}

/**
 * Trim stack trace to remove internal Playwright/Node.js frames,
 * keeping only frames that are likely relevant to the test code.
 */
function trimStackTrace(stack: string): string {
  if (!stack) return '';

  const lines = stack.split('\n');
  const relevantLines: string[] = [];
  let foundUserFrame = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Always keep non-frame lines (error messages, assertion details)
    if (!trimmed.startsWith('at ')) {
      relevantLines.push(line);
      continue;
    }

    // Skip internal frames
    if (
      trimmed.includes('node_modules/playwright') ||
      trimmed.includes('node_modules\\playwright') ||
      trimmed.includes('node_modules/@playwright') ||
      trimmed.includes('node_modules\\@playwright') ||
      trimmed.includes('node:internal/') ||
      trimmed.includes('node:async_hooks') ||
      trimmed.includes('node:events')
    ) {
      // If we already found user frames, stop — don't keep frames below the user code
      if (foundUserFrame) continue;
      continue;
    }

    foundUserFrame = true;
    relevantLines.push(line);
  }

  // Limit to 30 lines max
  return relevantLines.slice(0, 30).join('\n');
}
