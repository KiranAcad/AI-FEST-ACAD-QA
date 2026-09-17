import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';
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
  app.use('/docs', express.static(path.resolve(process.cwd(), 'docs')));
  app.get('/presentation', (_req, res) => {
    const presentationPath = path.resolve(process.cwd(), 'docs/PRESENTATION.html');
    if (fs.existsSync(presentationPath)) {
      return res.type('html').send(fs.readFileSync(presentationPath, 'utf-8'));
    }
    res.status(404).send('Presentation not found.');
  });

  let currentReport: AnalysisReport | null | undefined = latestReport;

  // ─── Test Runner State ──────────────────────────────────────────────
  let testProcess: ChildProcess | null = null;
  let testRunning = false;
  let testOutputBuffer: string[] = [];
  let testExitCode: number | null = null;
  const sseClients: express.Response[] = [];

  // ─── Analysis State ─────────────────────────────────────────────────
  let analysisRunning = false;
  let analysisAbortController: AbortController | null = null;

  function broadcastSSE(data: string) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try { client.write(message); } catch {}
    }
  }

  function broadcastSSEEvent(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try { client.write(message); } catch {}
    }
  }

  function killTestProcess() {
    if (testProcess) {
      try {
        if (process.platform === 'win32' && testProcess.pid) {
          spawn('taskkill.exe', ['/F', '/T', '/PID', String(testProcess.pid)]);
        } else {
          testProcess.kill('SIGTERM');
        }
      } catch {}
    }
    testRunning = false;
    testProcess = null;
  }

  function stopOngoingAnalysis() {
    if (analysisAbortController) {
      try {
        analysisAbortController.abort();
      } catch {}
    }
    analysisRunning = false;
    analysisAbortController = null;
  }

  // ─── API: Clear Dashboard / Results ─────────────────────────────────
  app.post('/api/clear-dashboard', (req, res) => {
    try {
      killTestProcess();
      stopOngoingAnalysis();
      currentReport = null; // Explicitly marked cleared
      testOutputBuffer = [];
      testExitCode = null;

      // Only remove report files if explicitly requested
      if (req.body?.clearReports === true || req.query?.clearReports === 'true') {
        const outputDir = path.resolve(process.cwd(), 'output');
        if (fs.existsSync(outputDir)) {
          const filesToClean = [
            'real-test-report.json',
            'real-test-report.html',
            'real-test-report.md',
            'sample-report.json',
            'sample-report.html',
            'sample-report.md',
            'report.json',
            'report.html',
            'report.md',
          ];
          for (const file of filesToClean) {
            const filePath = path.join(outputDir, file);
            if (fs.existsSync(filePath)) {
              try { fs.unlinkSync(filePath); } catch {}
            }
          }
        }
      }

      // Only delete results.json if explicitly requested (e.g. factory reset)
      if (req.body?.clearResults === true || req.query?.clearResults === 'true') {
        const testResultsPath = path.resolve(process.cwd(), 'real-tests/test-results/results.json');
        if (fs.existsSync(testResultsPath)) {
          try { fs.unlinkSync(testResultsPath); } catch {}
        }
      }

      broadcastSSEEvent('dashboard-cleared', { message: 'Dashboard cleared.' });

      res.json({ success: true, message: 'Dashboard and previous results cleared successfully.' });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // ─── API: Get Latest Report ────────────────────────────────────────
  app.get('/api/report', (_req, res) => {
    if (currentReport === null) {
      return res.status(404).json({ error: 'Dashboard has been cleared. Run tests or analysis to populate.' });
    }
    if (currentReport) {
      return res.json(currentReport);
    }
    // Try loading latest saved report JSON from disk first
    const jsonPath = path.resolve(process.cwd(), 'output/real-test-report.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        currentReport = report;
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

  // ─── API: Apply All Code Fixes ───────────────────────────────────────
  app.post('/api/apply-all-fixes', (_req, res) => {
    if (!currentReport || !currentReport.analyses) {
      const jsonPath = path.resolve(process.cwd(), 'output/real-test-report.json');
      if (fs.existsSync(jsonPath)) {
        try {
          currentReport = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch { /* ignore */ }
      }
    }

    if (!currentReport?.analyses) {
      return res.status(400).json({ success: false, error: 'No active report loaded.' });
    }

    let appliedCount = 0;
    for (const a of currentReport.analyses) {
      if (a.codeFix && applyCodeFix(a.codeFix)) {
        appliedCount++;
      }
    }
    res.json({ success: true, appliedCount });
  });

  // ─── API: Serve Failure Screenshot ─────────────────────────────────
  app.get('/api/screenshot', (req, res) => {
    const rawPath = req.query.path as string;
    if (!rawPath) return res.status(400).send('Missing path parameter');
    const resolvedPath = path.resolve(rawPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).send('Screenshot not found');
    }
    res.sendFile(resolvedPath);
  });

  // ─── API: Run Analysis from UI ─────────────────────────────────────
  // ─── API: Check Input Path Status ───────────────────────────────────
  app.get('/api/check-input', (req, res) => {
    const input = (req.query.path as string) || './real-tests/test-results/results.json';
    const inputPath = path.resolve(process.cwd(), input);
    const exists = fs.existsSync(inputPath);
    let sizeBytes = 0;
    if (exists) {
      try {
        sizeBytes = fs.statSync(inputPath).size;
      } catch {}
    }
    res.json({
      exists,
      path: input,
      resolvedPath: inputPath,
      sizeBytes,
    });
  });

  // ─── API: Run Analysis from UI ─────────────────────────────────────
  app.post('/api/analyze', async (req, res) => {
    if (analysisRunning) {
      return res.status(409).json({
        success: false,
        alreadyRunning: true,
        error: 'AI Analysis is currently in progress. Please wait for it to complete or click Stop Analysis.',
      });
    }

    const { input, provider, model, dryRun, applyFix: shouldApplyFix, vision } = req.body;

    const inputPath = path.resolve(process.cwd(), input || './real-tests/test-results/results.json');

    if (!fs.existsSync(inputPath)) {
      const isRealTests = inputPath.includes('real-tests');
      const hint = isRealTests
        ? 'Playwright test results not found yet. Please run your tests first under the "🧪 Run Tests" tab, or click "⚡ Run Tests & Analyze" to do both in 1 click.'
        : `Input file not found at: ${inputPath}`;
      return res.status(400).json({
        success: false,
        error: `Input path not found: ${inputPath}\n\n💡 Tip: ${hint}`,
        missingFile: true,
        isRealTests,
      });
    }

    analysisRunning = true;
    analysisAbortController = new AbortController();

    broadcastSSEEvent('analysis-status', { running: true, message: '🚀 Starting AI Failure Analysis...' });

    try {
      // Step 1: Parse
      const { failures, totalTests } = await parseTestResults(inputPath);

      if (failures.length === 0) {
        analysisRunning = false;
        broadcastSSEEvent('analysis-status', { running: false, message: 'All tests passed!' });
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

      broadcastSSEEvent('analysis-start', { totalFailures: failures.length, totalTests });

      // Step 2: Analyze with real-time SSE progress updates
      const resolvedProvider = (provider || 'ollama') as 'anthropic' | 'ollama';
      const report = await analyzeBatch(
        failures,
        {
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          provider: resolvedProvider,
          model: model || (resolvedProvider === 'ollama' ? (process.env.OLLAMA_MODEL || 'qwen3:1.7b') : 'claude-sonnet-4-20250514'),
          ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
          dryRun: dryRun || false,
          vision: vision || false,
        },
        inputPath,
        totalTests,
        (progress) => {
          broadcastSSEEvent('analysis-progress', progress);
        },
        analysisAbortController.signal
      );

      // Step 3: Save reports
      const outputDir = path.resolve(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const basePath = path.join(outputDir, 'real-test-report');
      fs.writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2), 'utf-8');
      fs.writeFileSync(`${basePath}.md`, generateMarkdownReport(report), 'utf-8');
      fs.writeFileSync(`${basePath}.html`, generateHtmlReport(report), 'utf-8');

      // Step 4: Optional apply fix
      let appliedFixesCount = 0;
      if (shouldApplyFix) {
        for (const a of report.analyses) {
          if (a.codeFix && applyCodeFix(a.codeFix)) {
            appliedFixesCount++;
          }
        }
      }

      currentReport = report;
      broadcastSSEEvent('analysis-done', { totalFailures: report.totalFailures, appliedFixesCount });
      res.json({ success: true, report, appliedFixesCount });
    } catch (err: any) {
      console.error('Analysis error:', err);
      broadcastSSEEvent('analysis-error', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      analysisRunning = false;
      analysisAbortController = null;
      broadcastSSEEvent('analysis-status', { running: false });
    }
  });

  // ─── API: Stop Running Analysis ─────────────────────────────────────
  app.post('/api/analyze/stop', (_req, res) => {
    if (!analysisRunning) {
      return res.status(400).json({ success: false, error: 'No analysis currently in progress.' });
    }
    stopOngoingAnalysis();
    broadcastSSEEvent('analysis-status', { running: false, stopped: true });
    broadcastSSE('\n⏹ Analysis stopped by user.\n');
    res.json({ success: true, message: 'Analysis stopped.' });
  });

  // ─── API: Analysis Status ───────────────────────────────────────────
  app.get('/api/analyze/status', (_req, res) => {
    res.json({
      running: analysisRunning,
    });
  });

  // ─── API: Run Playwright Tests ─────────────────────────────────────
  app.post('/api/run-tests', (req, res) => {
    if (testRunning) {
      // If tests are already running, attach gracefully instead of returning 409 error
      return res.json({
        success: true,
        message: 'Tests are already running. Attaching to live stream...',
        alreadyRunning: true,
      });
    }

    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';
    const headed = req.body?.headed === true;

    try {
      testOutputBuffer = [];
      testExitCode = null;

      // Build environment with optional headed mode
      const spawnEnv: Record<string, string> = { ...process.env } as Record<string, string>;
      if (headed) {
        spawnEnv['PLAYWRIGHT_HEADED'] = '1';
      }

      testProcess = spawn(npmCmd, ['run', 'test:real'], {
        cwd: process.cwd(),
        env: spawnEnv,
        shell: true,
      });

      testRunning = true;

      const modeLabel = headed ? '🖥️ Headed (Live Browser Preview)' : '🔇 Headless';
      broadcastSSEEvent('status', { running: true, message: `🚀 Playwright tests starting in ${modeLabel} mode...` });
      broadcastSSE(`\n🚀 Starting Playwright tests in ${modeLabel} mode...\n`);
      if (headed) {
        broadcastSSE('💡 A Chromium browser window will open on your screen — watch the tests execute live!\n');
      }
      broadcastSSE('📹 Video recordings enabled — replays will be available after tests complete.\n\n');

      testProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        testOutputBuffer.push(text);
        broadcastSSE(text);
      });

      testProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        testOutputBuffer.push(text);
        broadcastSSE(text);
      });

      testProcess.on('close', (code: number | null) => {
        testRunning = false;
        testExitCode = code;
        testProcess = null;
        const msg = code === 0
          ? '✅ All tests passed!'
          : `❌ Tests completed with exit code ${code}. Some tests may have failed.`;
        broadcastSSE(`\n${msg}\n`);
        broadcastSSE('📹 Test execution videos are now available in the Live Execution Replay panel.\n');
        broadcastSSEEvent('done', { exitCode: code, message: msg, videosReady: true });
      });

      testProcess.on('error', (err: Error) => {
        testRunning = false;
        testProcess = null;
        broadcastSSE(`\n❌ Failed to start tests: ${err.message}\n`);
        broadcastSSEEvent('done', { exitCode: -1, message: err.message });
      });

      res.json({ success: true, message: `Test run started in ${modeLabel} mode.`, headed });
    } catch (err: any) {
      testRunning = false;
      testProcess = null;
      console.error('Failed to spawn test process:', err);
      res.status(500).json({ success: false, error: `Failed to spawn test runner: ${err.message}` });
    }
  });

  // ─── API: List Recorded Test Videos ──────────────────────────────────
  app.get('/api/test-videos', (_req, res) => {
    const testResultsDir = path.resolve(process.cwd(), 'real-tests/test-results');
    if (!fs.existsSync(testResultsDir)) {
      return res.json({ videos: [] });
    }

    try {
      const videos: Array<{ name: string; path: string; size: number; test: string }> = [];

      // Recursively find all .webm video files in test-results
      function findVideos(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findVideos(fullPath);
          } else if (entry.name.endsWith('.webm')) {
            const stat = fs.statSync(fullPath);
            const relPath = path.relative(testResultsDir, fullPath).replace(/\\/g, '/');
            // Extract test name from parent directory name
            const parentDir = path.basename(path.dirname(fullPath));
            const testName = parentDir
              .replace(/-chromium$/, '')
              .replace(/-retry\d+$/, '')
              .replace(/-/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase());
            videos.push({
              name: entry.name,
              path: relPath,
              size: stat.size,
              test: testName,
            });
          }
        }
      }

      findVideos(testResultsDir);
      res.json({ videos });
    } catch (err) {
      res.status(500).json({ videos: [], error: String(err) });
    }
  });

  // ─── API: Serve Recorded Test Videos ────────────────────────────────
  const testResultsStaticDir = path.resolve(process.cwd(), 'real-tests/test-results');
  app.use('/api/test-videos/file', express.static(testResultsStaticDir));

  app.get('/api/test-video-stream', (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    const full = path.resolve(testResultsStaticDir, rel);
    if (!full.startsWith(testResultsStaticDir) || !fs.existsSync(full)) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.sendFile(full);
  });

  // ─── API: SSE Stream for Test Output ────────────────────────────────
  app.get('/api/run-tests/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send buffered output first
    for (const line of testOutputBuffer) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }

    // Send current status
    if (testRunning) {
      res.write(`event: status\ndata: ${JSON.stringify({ running: true })}\n\n`);
    } else if (testExitCode !== null) {
      res.write(`event: done\ndata: ${JSON.stringify({ exitCode: testExitCode })}\n\n`);
    }

    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // ─── API: Test Runner Status ────────────────────────────────────────
  app.get('/api/run-tests/status', (_req, res) => {
    res.json({
      running: testRunning,
      exitCode: testExitCode,
      outputLines: testOutputBuffer.length,
    });
  });

  // ─── API: Stop Running Tests ────────────────────────────────────────
  app.post('/api/run-tests/stop', (_req, res) => {
    if (!testRunning && !testProcess) {
      return res.status(400).json({ success: false, error: 'No tests running.' });
    }
    try {
      killTestProcess();
      broadcastSSE('\n⏹ Tests stopped by user.\n');
      broadcastSSEEvent('done', { exitCode: -1, message: 'Stopped by user' });
      res.json({ success: true, message: 'Tests stopped.' });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // ─── API: List Reports ──────────────────────────────────────────────
  app.get('/api/reports', (_req, res) => {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      return res.json({ reports: [], latestSummary: null });
    }

    try {
      let latestSummary: any = null;
      const jsonReportPath = path.join(outputDir, 'real-test-report.json');
      if (fs.existsSync(jsonReportPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
          const total = parsed.totalTests || 0;
          const fails = parsed.totalFailures || 0;
          const passRate = total > 0 ? ((1 - fails / total) * 100).toFixed(1) + '%' : '—';
          latestSummary = {
            title: 'Real Tests AI Failure Analysis',
            totalTests: total,
            totalFailures: fails,
            passRate,
            timestamp: parsed.timestamp || fs.statSync(jsonReportPath).mtime.toISOString(),
            isUpToDate: true,
          };
        } catch {}
      }

      const files = fs.readdirSync(outputDir)
        .filter(f => /\.(html|json|md)$/i.test(f))
        .map(f => {
          const fullPath = path.join(outputDir, f);
          const stat = fs.statSync(fullPath);
          const isRealLatest = f.startsWith('real-test-report');
          return {
            filename: f,
            extension: path.extname(f).replace('.', ''),
            sizeBytes: stat.size,
            sizeFormatted: stat.size > 1024 * 1024
              ? (stat.size / (1024 * 1024)).toFixed(1) + ' MB'
              : (stat.size / 1024).toFixed(1) + ' KB',
            lastModified: stat.mtime.toISOString(),
            isLatest: isRealLatest,
            label: isRealLatest ? '⚡ Latest Run' : 'Historical Archive',
          };
        })
        .sort((a, b) => {
          if (a.isLatest && !b.isLatest) return -1;
          if (!a.isLatest && b.isLatest) return 1;
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        });

      res.json({ reports: files, latestSummary });
    } catch (err) {
      res.status(500).json({ reports: [], latestSummary: null, error: String(err) });
    }
  });

  // ─── API: Delete Report File ────────────────────────────────────────
  app.delete('/api/reports/:filename', (req, res) => {
    const outputDir = path.resolve(process.cwd(), 'output');
    const filename = path.basename(req.params.filename);
    const filePath = path.join(outputDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Report ${filename} removed.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── API: Serve Individual Report File ──────────────────────────────
  app.get('/api/reports/:filename', (req, res) => {
    const outputDir = path.resolve(process.cwd(), 'output');
    const filename = path.basename(req.params.filename); // Sanitize
    const filePath = path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report file not found.' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.html') {
      res.type('html').send(fs.readFileSync(filePath, 'utf-8'));
    } else if (ext === '.md') {
      res.type('text/plain').send(fs.readFileSync(filePath, 'utf-8'));
    } else if (ext === '.json') {
      res.type('json').send(fs.readFileSync(filePath, 'utf-8'));
    } else {
      res.sendFile(filePath);
    }
  });

  // ─── API: Undo All Fixes (Restore .bak & Git Restore) ──────────────
  app.post('/api/undo-fixes', (_req, res) => {
    const testsDir = path.resolve(process.cwd(), 'real-tests/tests');
    if (!fs.existsSync(testsDir)) {
      return res.status(400).json({ success: false, error: 'Tests directory not found.' });
    }

    try {
      // 1. Restore from any .bak files created during auto-fix
      const files = fs.readdirSync(testsDir);
      let bakRestored = 0;
      for (const file of files) {
        if (file.endsWith('.bak')) {
          const origPath = path.join(testsDir, file.replace(/\.bak$/, ''));
          const bakPath = path.join(testsDir, file);
          try {
            fs.copyFileSync(bakPath, origPath);
            fs.unlinkSync(bakPath);
            bakRestored++;
          } catch {}
        }
      }

      // 2. Also run git checkout -- real-tests/tests/ for tracked files
      const isWindows = process.platform === 'win32';
      const gitCmd = isWindows ? 'git.exe' : 'git';
      const result = spawn(gitCmd, ['checkout', '--', 'real-tests/tests/'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      result.on('close', () => {
        res.json({
          success: true,
          message: `Test files reverted to original clean baseline (${bakRestored} backups restored).`,
        });
      });

      result.on('error', () => {
        // Even if git fails, we already restored any .bak files
        res.json({
          success: true,
          message: `Test files reverted (${bakRestored} backups restored).`,
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
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
    console.log('  │     🧪 Run Tests      — Execute Playwright      │');
    console.log('  │     📑 Reports        — Browse & download       │');
    console.log('  │                                                  │');
    console.log('  └──────────────────────────────────────────────────┘');
    console.log('');
  });

  return app;
}
