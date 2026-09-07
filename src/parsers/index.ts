/**
 * Parser barrel export and auto-detection.
 *
 * Currently supports Playwright JSON reporter output.
 * Allure result files can be added as additional parsers later.
 */

import { statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ParsedFailure } from '../types.js';
import { parsePlaywrightResults } from './playwright-parser.js';
import { parseAllureResultsDir } from './allure-parser.js';

export { parsePlaywrightResults } from './playwright-parser.js';
export { parseAllureResultsDir } from './allure-parser.js';

export type InputFormat = 'playwright-json' | 'allure-results';

/**
 * Auto-detect input format and parse test results.
 *
 * @param inputPath - Path to the test results file or directory
 * @returns Parsed failures and total test count
 */
export async function parseTestResults(inputPath: string): Promise<{
  failures: ParsedFailure[];
  totalTests: number;
  format: InputFormat;
}> {
  if (!existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stat = statSync(inputPath);

  // If inputPath is a directory, check if it's an allure-results directory
  if (stat.isDirectory()) {
    const result = parseAllureResultsDir(inputPath);
    return { ...result, format: 'allure-results' };
  }

  // Otherwise try to detect format from file contents
  const raw = await readFile(inputPath, 'utf-8');
  const data = JSON.parse(raw);

  // Playwright JSON reports have a top-level "suites" array and "config" object
  if (data.suites && Array.isArray(data.suites) && data.config) {
    const result = await parsePlaywrightResults(inputPath);
    return { ...result, format: 'playwright-json' };
  }

  throw new Error(
    `Could not detect input format for: ${inputPath}\n` +
      'Currently supported formats:\n' +
      '  - Playwright JSON reporter output (--reporter=json)\n' +
      '  - Allure Results directory (allure-results/)\n'
  );
}
