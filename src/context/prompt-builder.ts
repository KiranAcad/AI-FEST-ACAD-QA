/**
 * Context Builder — Prompt Builder
 *
 * Builds token-efficient LLM prompts from parsed failure data.
 * Each prompt contains structured sections that help the model
 * quickly identify relevant information for classification.
 */

import { ParsedFailure } from '../types.js';

/** Approximate token count (rough heuristic: 1 token ≈ 4 characters). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a clean, structured prompt for a single test failure.
 *
 * Designed to be token-efficient while providing all the context
 * the LLM needs to classify the root cause accurately.
 */
export function buildFailurePrompt(failure: ParsedFailure): string {
  const sections: string[] = [];

  // Header with test metadata
  sections.push(`## Failed Test: ${failure.testName}`);
  sections.push(`**File:** ${failure.filePath}`);
  sections.push(`**Duration:** ${failure.duration}ms | **Retries:** ${failure.retries}`);

  // Attachment references (informational, not analyzed)
  if (failure.screenshotPath || failure.videoPath) {
    const attachments: string[] = [];
    if (failure.screenshotPath) attachments.push(`Screenshot: ${failure.screenshotPath}`);
    if (failure.videoPath) attachments.push(`Video: ${failure.videoPath}`);
    sections.push(`**Artifacts:** ${attachments.join(' | ')}`);
  }

  sections.push(''); // blank line

  // Error message — the most critical piece of context
  sections.push('### Error Message');
  sections.push('```');
  sections.push(failure.errorMessage);
  sections.push('```');
  sections.push('');

  // Stack trace — trimmed to relevant frames
  if (failure.stackTrace) {
    const trimmedStack = trimToRelevantFrames(failure.stackTrace, 25);
    sections.push('### Stack Trace (trimmed to relevant frames)');
    sections.push('```');
    sections.push(trimmedStack);
    sections.push('```');
    sections.push('');
  }

  // Log lines — last 15-20 lines before failure
  if (failure.logLines.length > 0) {
    const logSlice = failure.logLines.slice(-20);
    sections.push(`### Log Lines (last ${logSlice.length} lines)`);
    sections.push('```');
    sections.push(logSlice.join('\n'));
    sections.push('```');
  }

  return sections.join('\n');
}

/**
 * Trim stack trace to keep only the most relevant frames.
 * Removes internal Playwright/Node frames and limits total lines.
 */
function trimToRelevantFrames(stackTrace: string, maxLines: number): string {
  const lines = stackTrace.split('\n');
  const relevant: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip internal framework frames
    if (
      trimmed.includes('node_modules/@playwright') ||
      trimmed.includes('node_modules\\@playwright') ||
      trimmed.includes('node_modules/playwright') ||
      trimmed.includes('node_modules\\playwright') ||
      trimmed.includes('node:internal/') ||
      trimmed.includes('node:async_hooks') ||
      trimmed.includes('node:events')
    ) {
      continue;
    }

    relevant.push(line);

    if (relevant.length >= maxLines) break;
  }

  return relevant.join('\n');
}

/**
 * Estimate the total tokens for a batch of failures.
 * Useful for cost estimation before making API calls.
 */
export function estimateBatchTokens(failures: ParsedFailure[]): number {
  return failures.reduce((total, f) => total + estimateTokens(buildFailurePrompt(f)), 0);
}
