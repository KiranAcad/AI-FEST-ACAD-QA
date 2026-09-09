import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { applyCodeFix } from '../autofix/diff-generator.js';
import { getFlakyTestMetrics } from '../db/history.js';
import { parseTestResults } from '../parsers/index.js';
import { analyzeBatch } from '../llm/batch-analyzer.js';
import { generateMarkdownReport } from '../report/markdown-report.js';
import { generateHtmlReport } from '../report/html-report.js';
import { AnalysisReport } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboardServer(
  port: number = 3000,
  latestReport?: AnalysisReport
): express.Express {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  let currentReport: AnalysisReport | undefined = latestReport;

  // ─── API: Get Latest Report ────────────────────────────────────────
  app.get('/api/report', (_req, res) => {
    if (currentReport) {
      return res.json(currentReport);
    }
    // Try loading latest saved report JSON from disk
    const jsonPath = path.resolve(process.cwd(), 'output/real-test-report.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        return res.json(report);
      } catch { /* fall through */ }
    }
    res.status(404).json({ error: 'No analysis report found. Run analysis first.' });
  });

  // ─── API: Get Flaky Metrics ────────────────────────────────────────
  app.get('/api/flaky', (_req, res) => {
    try {
      const metrics = getFlakyTestMetrics();
      res.json(metrics);
    } catch (err) {
      res.json([]);
    }
  });

  // ─── API: Apply Code Fix ───────────────────────────────────────────
  app.post('/api/apply-fix', (req, res) => {
    const { codeFix } = req.body;
    if (!codeFix) {
      return res.status(400).json({ success: false, error: 'codeFix payload required' });
    }
    try {
      const success = applyCodeFix(codeFix);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // ─── API: Run Analysis from UI ─────────────────────────────────────
  app.post('/api/analyze', async (req, res) => {
    const { input, provider, model, dryRun, applyFix: shouldApplyFix, vision } = req.body;

    const inputPath = path.resolve(process.cwd(), input || './real-tests/test-results/results.json');

    if (!fs.existsSync(inputPath)) {
      return res.status(400).json({ success: false, error: `Input path not found: ${inputPath}` });
    }

    try {
      // Step 1: Parse
      const { failures, totalTests } = await parseTestResults(inputPath);

      if (failures.length === 0) {
        return res.json({
          success: true,
          message: 'All tests passed! No failures to analyze.',
          report: {
            timestamp: new Date().toISOString(),
            inputPath, totalTests, totalFailures: 0,
            analyses: [], tokenUsage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
          },
        });
      }

      // Step 2: Analyze
      const resolvedProvider = (provider || 'ollama') as 'anthropic' | 'ollama';
      const report = await analyzeBatch(
        failures,
        {
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          provider: resolvedProvider,
          model: model || (resolvedProvider === 'ollama' ? 'qwen3:8b' : 'claude-sonnet-4-20250514'),
          ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
          dryRun: dryRun || false,
          vision: vision || false,
        },
        inputPath,
        totalTests
      );

      // Step 3: Save reports
      const outputDir = path.resolve(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const basePath = path.join(outputDir, 'real-test-report');
      fs.writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2), 'utf-8');
      fs.writeFileSync(`${basePath}.md`, generateMarkdownReport(report), 'utf-8');
      fs.writeFileSync(`${basePath}.html`, generateHtmlReport(report), 'utf-8');

      // Step 4: Optional apply fix
      if (shouldApplyFix) {
        for (const a of report.analyses) {
          if (a.codeFix) applyCodeFix(a.codeFix);
        }
      }

      currentReport = report;
      res.json({ success: true, report });
    } catch (err) {
      console.error('Analysis error:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Serve Dashboard UI ────────────────────────────────────────────
  app.get('/', (_req, res) => {
    // Resolve dashboard.html relative to project root since tsx doesn't copy HTML
    const candidates = [
      path.resolve(process.cwd(), 'src/server/dashboard.html'),
      path.join(__dirname, 'dashboard.html'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return res.type('html').send(fs.readFileSync(p, 'utf-8'));
      }
    }
    res.status(500).send('Dashboard HTML not found. Expected at src/server/dashboard.html');
  });

  app.listen(port, () => {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────┐');
    console.log('  │                                                  │');
    console.log('  │   🤖 AI Failure Analysis Copilot Dashboard       │');
    console.log('  │                                                  │');
    console.log(`  │   🌐 http://localhost:${port}                        │`);
    console.log('  │                                                  │');
    console.log('  │   Pages:                                         │');
    console.log('  │     📊 Dashboard      — Overview & metrics       │');
    console.log('  │     🚨 Failure Triage — Interactive AI analysis  │');
    console.log('  │     📈 Flaky Analytics — History & scores        │');
    console.log('  │     ▶  Run Analysis   — Trigger from browser    │');
    console.log('  │                                                  │');
    console.log('  └──────────────────────────────────────────────────┘');
    console.log('');
  });

  return app;
}
