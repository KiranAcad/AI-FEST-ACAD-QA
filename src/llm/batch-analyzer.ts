/**
 * Batch Analyzer — Orchestrates analysis of multiple test failures
 *
 * Processes failures sequentially (one API call per failure for POC simplicity)
 * with progress logging and aggregated token usage tracking.
 */

import path from 'node:path';
import chalk from 'chalk';
import {
  ParsedFailure,
  FailureAnalysis,
  AnalysisReport,
  TokenUsage,
} from '../types.js';
import { createAnalyzer, AnalyzerConfig } from './analyzer.js';

import { generateCodeFix } from '../autofix/diff-generator.js';
import { recordTestResult, getFlakyTestMetrics } from '../db/history.js';
import { analyzeScreenshot } from './vision-analyzer.js';

export interface AnalysisProgressEvent {
  index: number;
  total: number;
  testName: string;
  category?: string;
  confidence?: string;
  status: 'start' | 'done' | 'error';
  message?: string;
}

export type AnalysisProgressCallback = (event: AnalysisProgressEvent) => void;

export interface BatchAnalyzerConfig extends AnalyzerConfig {
  /** If true, use mock analyzer instead of real Claude API */
  dryRun?: boolean;
  /** Perform vision analysis on screenshots */
  vision?: boolean;
}

/**
 * Analyze a batch of test failures.
 *
 * Processes each failure sequentially, tracks progress, and aggregates results
 * into a single AnalysisReport.
 */
export async function analyzeBatch(
  failures: ParsedFailure[],
  config: BatchAnalyzerConfig,
  inputPath: string,
  totalTests: number,
  onProgress?: AnalysisProgressCallback,
  abortSignal?: AbortSignal
): Promise<AnalysisReport> {
  const analyses: FailureAnalysis[] = [];
  const aggregateUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };

  if (config.dryRun) {
    console.log(chalk.yellow('\n🔸 Dry-run mode — using mock analysis (no API calls)\n'));
    for (let i = 0; i < failures.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Analysis cancelled by user.');
      }
      const failure = failures[i];
      onProgress?.({
        index: i + 1,
        total: failures.length,
        testName: failure.testName,
        status: 'start',
        message: `[${i + 1}/${failures.length}] Analyzing ${truncate(failure.testName, 55)} (Dry Run)...`,
      });

      console.log(
        chalk.dim(`  [${i + 1}/${failures.length}] `) +
          chalk.white(truncate(failure.testName, 60)) +
          chalk.dim(' → ') +
          chalk.yellow('mock analysis')
      );
      const mockAnalysis = createMockAnalysis(failure);

      // Optional vision analysis in dry-run mode
      if (config.vision && failure.screenshotPath) {
        mockAnalysis.visualAnalysis = `[Dry Run] Screenshot ${path.basename(failure.screenshotPath)} inspected: UI state at failure timestamp confirms target element was unavailable or obscured in DOM.`;
      }

      // Generate code fix patch
      mockAnalysis.codeFix = generateCodeFix(failure, mockAnalysis.suggestedAction);

      // Record in SQLite DB
      recordTestResult(failure, mockAnalysis);

      analyses.push(mockAnalysis);

      onProgress?.({
        index: i + 1,
        total: failures.length,
        testName: failure.testName,
        category: mockAnalysis.category,
        confidence: mockAnalysis.confidence,
        status: 'done',
        message: `[${i + 1}/${failures.length}] ${truncate(failure.testName, 50)} → ${mockAnalysis.category} (${mockAnalysis.confidence})`,
      });
    }
  } else {
    const analyzer = createAnalyzer(config);
    console.log(
      chalk.blue(`\n🔍 Analyzing ${failures.length} failure(s) with ${analyzer.model}...\n`)
    );

    for (let i = 0; i < failures.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Analysis cancelled by user.');
      }
      const failure = failures[i];
      const prefix = chalk.dim(`  [${i + 1}/${failures.length}] `);

      onProgress?.({
        index: i + 1,
        total: failures.length,
        testName: failure.testName,
        status: 'start',
        message: `[${i + 1}/${failures.length}] AI Triaging: ${truncate(failure.testName, 55)}...`,
      });

      try {
        process.stdout.write(prefix + chalk.white(truncate(failure.testName, 60)) + chalk.dim(' → '));

        const { analysis, tokenUsage } = await analyzer.analyzeFailure(failure);

        // Optional vision analysis if screenshot present
        if (config.vision && failure.screenshotPath) {
          analysis.visualAnalysis = await analyzeScreenshot(failure, config.provider || 'ollama', config.ollamaUrl, config.model);
        }

        // Generate code fix patch
        analysis.codeFix = generateCodeFix(failure, analysis.suggestedAction);

        // Record in SQLite DB
        recordTestResult(failure, analysis);

        // Color code by confidence
        const confColor =
          analysis.confidence === 'High' ? chalk.green :
          analysis.confidence === 'Medium' ? chalk.yellow :
          chalk.red;

        console.log(
          chalk.cyan(analysis.category) +
            ' ' +
            confColor(`(${analysis.confidence})`)
        );

        analyses.push(analysis);
        aggregateUsage.inputTokens += tokenUsage.inputTokens;
        aggregateUsage.outputTokens += tokenUsage.outputTokens;
        aggregateUsage.estimatedCost += tokenUsage.estimatedCost;

        onProgress?.({
          index: i + 1,
          total: failures.length,
          testName: failure.testName,
          category: analysis.category,
          confidence: analysis.confidence,
          status: 'done',
          message: `[${i + 1}/${failures.length}] ${truncate(failure.testName, 50)} → ${analysis.category} (${analysis.confidence})`,
        });
      } catch (error: any) {
        console.log(chalk.red('ERROR'));
        console.error(chalk.red(`    ${error instanceof Error ? error.message : String(error)}`));

        // Push a fallback analysis so the report still includes this test
        const fallback: FailureAnalysis = {
          testName: failure.testName,
          category: 'Unknown/Needs Manual Review',
          confidence: 'Low',
          explanation: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          suggestedAction: 'Manually review the test failure logs and stack trace.',
          relevantLogExcerpt: failure.errorMessage.slice(0, 200),
        };
        fallback.codeFix = generateCodeFix(failure, fallback.suggestedAction);
        recordTestResult(failure, fallback);
        analyses.push(fallback);

        onProgress?.({
          index: i + 1,
          total: failures.length,
          testName: failure.testName,
          category: fallback.category,
          confidence: fallback.confidence,
          status: 'error',
          message: `[${i + 1}/${failures.length}] ${truncate(failure.testName, 50)} → ERROR: ${error.message || 'Analysis failed'}`,
        });
      }
    }
  }

  // Get flaky test history from SQLite DB
  const flakyMetrics = getFlakyTestMetrics();

  return {
    timestamp: new Date().toISOString(),
    inputPath,
    totalTests,
    totalFailures: failures.length,
    analyses,
    flakyMetrics,
    tokenUsage: aggregateUsage,
  };
}

/**
 * Create a mock analysis for dry-run mode.
 * Uses improved heuristics on the error message and stack trace to pick a plausible category.
 * Designed to handle real Playwright error output patterns.
 */
function createMockAnalysis(failure: ParsedFailure): FailureAnalysis {
  const msg = failure.errorMessage.toLowerCase();
  const stack = failure.stackTrace.toLowerCase();
  const allText = `${msg}\n${stack}\n${failure.logLines.join('\n')}`.toLowerCase();

  let category: FailureAnalysis['category'] = 'Unknown/Needs Manual Review';
  let confidence: FailureAnalysis['confidence'] = 'Medium';
  let explanation = '';
  let suggestedAction = '';

  // ── Priority 1: Locator/Selector Issues ──
  // Element not found or wrong selector — most specific signal
  const elementNotFound =
    msg.includes('resolved to 0 elements') ||
    msg.includes('element(s) not found') ||
    (msg.includes('locator') && msg.includes('strict mode violation')) ||
    (!msg.includes('unexpected value') && (
      (msg.includes('locator.click') && msg.includes('timeout')) ||
      (msg.includes('waiting for locator') && msg.includes('timeout') && !msg.includes('tohavetext'))
    ));

  if (elementNotFound) {
    category = 'Locator/Selector Issue';
    confidence = 'High';
    // Extract the selector from the error
    const selectorMatch = failure.errorMessage.match(/locator\(['"]([^'"]+)['"]\)/i) ||
                          failure.errorMessage.match(/locator\('([^']+)'\)/i) ||
                          failure.errorMessage.match(/waiting for locator\('([^']+)'\)/i);
    const selector = selectorMatch ? selectorMatch[1] : 'unknown selector';
    explanation = `The test failed because the element '${selector}' could not be found on the page. This typically happens when the selector is wrong, the DOM structure changed, or the element hasn't rendered yet.`;
    suggestedAction = `Inspect the page to find the correct selector for '${selector}'. Use more resilient selectors like data-testid, role-based locators, or text-based locators.`;
  }
  // Visibility issue — element exists but not visible
  else if (
    (msg.includes('tobevisible') && msg.includes('failed')) ||
    (msg.includes('expected') && msg.includes('visible') && msg.includes('hidden')) ||
    (msg.includes('tobevisible') && msg.includes('element(s) not found'))
  ) {
    category = 'Locator/Selector Issue';
    confidence = 'Medium';
    explanation = `The test expected an element to be visible, but it was either hidden or not found. This could be a wrong selector, or the expected element never appeared (e.g., wrong credentials, missing navigation).`;
    suggestedAction = `Verify the selector targets the correct element. Check if the test preconditions (login, navigation) are working correctly. Consider adding explicit waits if the element appears asynchronously.`;
  }
  // ── Priority 2: Timing/Sync Issues ──
  // Generic timeout without a locator issue
  else if (
    (msg.includes('timeout') && msg.includes('exceeded') && !msg.includes('locator.click')) ||
    msg.includes('test timeout') ||
    (msg.includes('tohavetext') && msg.includes('timeout'))
  ) {
    category = 'Timing/Sync Issue';
    confidence = 'High';
    explanation = `The test timed out waiting for a condition. The operation exceeded the configured timeout, suggesting the application is slow or the wait condition is inappropriate.`;
    suggestedAction = `Increase the timeout, add a more specific wait condition (e.g., waitForResponse, waitForLoadState), or investigate why the application is slow to respond.`;
  }
  // ── Priority 3: Status code / Infra Issues ──
  else if (
    msg.includes('503') || msg.includes('502') || msg.includes('504') ||
    msg.includes('econnrefused') || msg.includes('service unavailable') ||
    msg.includes('net::err_')
  ) {
    category = 'Environment/Infra Issue';
    confidence = 'High';
    explanation = `The test encountered an infrastructure error — the service returned an error status code or was unreachable.`;
    suggestedAction = `Check if the target environment/service is healthy. Verify network connectivity and service deployment status.`;
  }
  // ── Priority 4: Test Data Issues ──
  else if (
    msg.includes('expired') || msg.includes('invalid credentials') ||
    msg.includes('stale') || allText.includes('staging') ||
    allText.includes('locked_out') || allText.includes('locked out')
  ) {
    category = 'Test Data Issue';
    confidence = 'Medium';
    explanation = `The test failed due to a test data issue — the credentials, user account, or data used in the test is invalid or in an unexpected state for this environment.`;
    suggestedAction = `Verify the test data (credentials, user accounts, test records) is valid and appropriate for the current test environment. Update hardcoded values if they've changed.`;
  }
  // ── Priority 5: Assertion failures — differentiate app bug vs test script bug ──
  else if (
    msg.includes('expect(received)') ||
    msg.includes('tohavetext') || msg.includes('tohavecount') ||
    msg.includes('tobe(') || msg.includes('tocontain') || msg.includes('toequal') ||
    msg.includes('tobegreaterthan') || msg.includes('tobelessthan')
  ) {
    // Look for signals that it's a test script bug vs app bug
    const receivedExpected = failure.errorMessage.match(/Expected:\s*(.+)\nReceived:\s*(.+)/i);

    if (
      allText.includes('bug in test') || allText.includes('wrong element') ||
      allText.includes('wrong selector') || allText.includes('descending') ||
      msg.includes('tobegreaterthanorequal') ||
      (receivedExpected && areValuesSimilar(receivedExpected[1], receivedExpected[2]))
    ) {
      category = 'Test Script Bug';
      confidence = 'Medium';
      explanation = `The assertion logic in the test appears incorrect — the test may be checking the wrong element, using wrong expected values, or has a logic error in the assertion.`;
      suggestedAction = `Review the test assertion logic. Check if the selector, expected value, and comparison operator are correct. The test code may need to be fixed.`;
    } else if (
      msg.includes('500') || (receivedExpected && isServerError(receivedExpected[2]))
    ) {
      category = 'Environment/Infra Issue';
      confidence = 'Medium';
      explanation = `The assertion failed because the server returned an error response, suggesting an infrastructure or deployment issue rather than a test problem.`;
      suggestedAction = `Check the server/environment health. The application may be returning error responses due to a deployment or configuration issue.`;
    } else {
      category = 'Application Bug';
      confidence = 'Medium';
      explanation = `The assertion failed with a value mismatch that appears to be a genuine application defect — the expected and received values don't match, and the test logic looks correct.`;
      suggestedAction = `File a bug report. The application is producing incorrect output. Review recent code changes that may have caused this regression.`;
    }
  }

  // ── Override: Status code assertion failures (e.g., expected 200, got 500) ──
  if (
    category === 'Unknown/Needs Manual Review' &&
    msg.includes('expected') && (msg.includes('200') || msg.includes('status'))
  ) {
    if (msg.includes('500') || msg.includes('503') || msg.includes('502')) {
      category = 'Environment/Infra Issue';
      confidence = 'High';
      explanation = `The test expected a success response but received a server error status code, indicating the service is unhealthy or misconfigured.`;
      suggestedAction = `Check the health and deployment status of the target service. This is likely a transient or environment issue.`;
    }
  }

  return {
    testName: failure.testName,
    category,
    confidence,
    explanation: explanation || `[MOCK] Pattern analysis of error: "${failure.errorMessage.slice(0, 120)}..."`,
    suggestedAction: suggestedAction || '[MOCK] Run with actual Claude API for detailed, context-specific suggestions.',
    relevantLogExcerpt: failure.errorMessage.slice(0, 300),
  };
}

/** Check if two values are "similar" (same format, close numbers) — suggests test script bug */
function areValuesSimilar(expected: string, received: string): boolean {
  // If they look like the same format (both prices, both counts, etc.)
  const e = expected.trim().replace(/"/g, '');
  const r = received.trim().replace(/"/g, '');
  // Both are numbers
  if (!isNaN(Number(e)) && !isNaN(Number(r))) {
    return Math.abs(Number(e) - Number(r)) / Math.max(Number(e), Number(r), 1) < 0.3;
  }
  return false;
}

/** Check if a received value is a server error */
function isServerError(value: string): boolean {
  const v = value.trim().replace(/"/g, '');
  return ['500', '502', '503', '504'].includes(v);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}
