/**
 * CLI — Command-line interface for the AI Failure Analysis Copilot
 *
 * Usage:
 *   npx tsx src/index.ts analyze --input <path> --output <path> [--format md|html|both] [--model <model>] [--dry-run]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { resolve, join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { parseTestResults } from './parsers/index.js';
import { analyzeBatch } from './llm/batch-analyzer.js';
import { generateMarkdownReport } from './report/markdown-report.js';
import { generateHtmlReport } from './report/html-report.js';
import { injectAllureAttachments } from './report/allure-injector.js';
import { applyCodeFix } from './autofix/diff-generator.js';
import { startDashboardServer } from './server/app.js';
import { AnalysisReport, RootCauseCategory } from './types.js';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('ai-failure-analysis')
  .description('AI-powered root cause analysis for failed Playwright tests')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze failed test results and generate a root cause report')
  .option('-i, --input <path>', 'Path to Playwright JSON results file or allure-results directory')
  .option('-o, --output <path>', 'Output path for the report (without extension)', './output/report')
  .option('-p, --provider <provider>', 'LLM provider: anthropic or ollama', process.env.LLM_PROVIDER || 'anthropic')
  .option('-f, --format <format>', 'Report format: md, html, or both', 'both')
  .option('-m, --model <model>', 'Model name to use (e.g. claude-sonnet-4-20250514 or qwen3:8b)')
  .option('--ollama-url <url>', 'Base URL for Ollama', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
  .option('--dry-run', 'Use mock analysis instead of LLM (no API/server needed)', false)
  .option('--allure-dir <path>', 'Path to allure-results directory to inject AI attachments into')
  .option('--apply-fix', 'Automatically apply proposed AI code fixes directly to spec files on disk', false)
  .option('--vision', 'Perform visual screenshot analysis using Vision LLM', false)
  .option('--server', 'Start live interactive Web UI Dashboard on port 3000', false)
  .action(async (options) => {
    try {
      await runAnalysis(options);
    } catch (error) {
      console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

async function runAnalysis(options: {
  input?: string;
  output?: string;
  provider?: string;
  format?: string;
  model?: string;
  ollamaUrl?: string;
  dryRun?: boolean;
  allureDir?: string;
  applyFix?: boolean;
  vision?: boolean;
  server?: boolean;
}) {
  // ─── Resolve input file path ───────────────────────────────────────
  let resolvedInput = options.input;
  if (!resolvedInput) {
    if (existsSync(resolve('./real-tests/test-results/results.json'))) {
      resolvedInput = './real-tests/test-results/results.json';
    } else if (existsSync(resolve('./fixtures/sample-playwright-results.json'))) {
      resolvedInput = './fixtures/sample-playwright-results.json';
    } else {
      throw new Error(
        'No input file specified with --input, and no default results.json found in ./real-tests/test-results/ or ./fixtures/'
      );
    }
  }

  const inputPath = resolve(resolvedInput);
  const outputPath = resolve(options.output || './output/report');
  const format = (options.format || 'both') as 'md' | 'html' | 'both';

  // ─── Resolve provider & model ──────────────────────────────────────
  let provider = (options.provider || 'anthropic').toLowerCase() as 'anthropic' | 'ollama';
  if (options.model?.includes('qwen') || options.model?.includes('llama') || options.model?.includes('mistral') || options.model?.includes('deepseek')) {
    provider = 'ollama';
  }

  let model = options.model;
  if (!model) {
    model = provider === 'ollama' ? (process.env.OLLAMA_MODEL || 'qwen3:8b') : (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514');
  }

  // ─── Banner ─────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.cyan('  ╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║   🔍 AI Failure Analysis Copilot (POC)      ║'));
  console.log(chalk.bold.cyan('  ╚══════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.dim(`  Provider: `) + chalk.cyan(provider) + chalk.dim(` | Model: `) + chalk.white(model));

  // ─── Validate inputs & provider ────────────────────────────────────
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let isDryRun = options.dryRun || false;

  if (provider === 'anthropic' && !isDryRun && (!apiKey || apiKey === 'your-api-key-here')) {
    console.log(chalk.yellow('  ⚠ No valid ANTHROPIC_API_KEY found in .env'));
    console.log(chalk.yellow('  ⚠ Falling back to dry-run mode (mock analysis)\n'));
    isDryRun = true;
  }

  // ─── Step 1: Parse ─────────────────────────────────────────────────
  console.log(chalk.dim('  ─── Step 1: Parsing test results ───'));
  console.log(chalk.dim(`  Input: ${inputPath}`));

  const { failures, totalTests, format: inputFormat } = await parseTestResults(inputPath);

  console.log(chalk.green(`  ✓ Detected format: ${inputFormat}`));
  console.log(chalk.green(`  ✓ Found ${totalTests} total test(s), ${failures.length} failure(s)`));

  if (failures.length === 0) {
    console.log(chalk.green('\n  🎉 No failures found — all tests passed!'));
    return;
  }

  // ─── Step 2: Analyze ───────────────────────────────────────────────
  console.log(chalk.dim('\n  ─── Step 2: Analyzing failures ───'));

  const report: AnalysisReport = await analyzeBatch(
    failures,
    {
      apiKey: apiKey || '',
      provider,
      model,
      ollamaUrl: options.ollamaUrl,
      dryRun: isDryRun,
    },
    inputPath,
    totalTests
  );

  // ─── Step 3: Generate Report ───────────────────────────────────────
  console.log(chalk.dim('\n  ─── Step 3: Generating report ───'));

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const writtenFiles: string[] = [];

  // Always save JSON for dashboard API access
  const jsonPath = `${outputPath}.json`;
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  writtenFiles.push(jsonPath);
  console.log(chalk.green(`  ✓ JSON report: ${jsonPath}`));

  if (format === 'md' || format === 'both') {
    const mdPath = `${outputPath}.md`;
    const mdContent = generateMarkdownReport(report);
    await writeFile(mdPath, mdContent, 'utf-8');
    writtenFiles.push(mdPath);
    console.log(chalk.green(`  ✓ Markdown report: ${mdPath}`));
  }

  if (format === 'html' || format === 'both') {
    const htmlPath = `${outputPath}.html`;
    const htmlContent = generateHtmlReport(report);
    await writeFile(htmlPath, htmlContent, 'utf-8');
    writtenFiles.push(htmlPath);
    console.log(chalk.green(`  ✓ HTML report: ${htmlPath}`));
  }

  // ─── Step 4: Optional Allure Attachment Injection ─────────────────
  if (options.allureDir && existsSync(resolve(options.allureDir))) {
    const injected = injectAllureAttachments(resolve(options.allureDir), report);
    console.log(chalk.green(`  ✓ Injected AI Triage attachments into ${injected} Allure result file(s)`));
  }

  // ─── Step 5: Optional Apply Code Fixes ─────────────────────────────
  if (options.applyFix) {
    let appliedCount = 0;
    for (const a of report.analyses) {
      if (a.codeFix && applyCodeFix(a.codeFix)) {
        appliedCount++;
      }
    }
    console.log(chalk.green(`  ⚡ Applied AI code fix patches to ${appliedCount} test spec file(s) on disk`));
  }

  // ─── Console Summary ──────────────────────────────────────────────
  printConsoleSummary(report);

  // ─── Optional Dashboard Server ───────────────────────────────────
  if (options.server) {
    startDashboardServer(3000, report);
  }
}

function printConsoleSummary(report: AnalysisReport): void {
  console.log('');
  console.log(chalk.bold.green(`  ✅ Analysis complete — ${report.totalFailures} failure(s) analyzed`));
  console.log('');

  // Category breakdown with visual bars
  console.log(chalk.bold('  📊 Root Cause Summary:'));
  console.log('');

  const categoryCounts: Record<string, number> = {};
  for (const a of report.analyses) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  }

  const sorted = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a);
  const maxCount = Math.max(...sorted.map(([, c]) => c));

  const CATEGORY_COLORS: Record<string, typeof chalk.blue> = {
    'Locator/Selector Issue': chalk.blue,
    'Timing/Sync Issue': chalk.yellow,
    'Test Data Issue': chalk.magenta,
    'Environment/Infra Issue': chalk.red,
    'Application Bug': chalk.hex('#ec4899'),
    'Test Script Bug': chalk.cyan,
    'Unknown/Needs Manual Review': chalk.gray,
  };

  for (const [category, count] of sorted) {
    const barLength = Math.max(1, Math.round((count / maxCount) * 15));
    const bar = '█'.repeat(barLength);
    const pct = ((count / report.totalFailures) * 100).toFixed(1);
    const colorFn = CATEGORY_COLORS[category] || chalk.white;
    const paddedCategory = category.padEnd(28);
    console.log(`     ${chalk.dim(paddedCategory)} ${colorFn(bar)} ${count} (${pct}%)`);
  }

  // Token usage
  console.log('');
  if (report.tokenUsage.inputTokens > 0) {
    console.log(
      chalk.dim('  💰 Token usage: ') +
        chalk.white(`${report.tokenUsage.inputTokens.toLocaleString()} input`) +
        chalk.dim(' / ') +
        chalk.white(`${report.tokenUsage.outputTokens.toLocaleString()} output`) +
        chalk.dim(' ≈ ') +
        chalk.green(`$${report.tokenUsage.estimatedCost.toFixed(4)}`)
    );
  } else {
    console.log(chalk.dim('  💰 Token usage: N/A (dry-run mode)'));
  }

  console.log('');
}

export { program };
