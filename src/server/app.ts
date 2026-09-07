import express from 'express';
import path from 'path';
import fs from 'fs';
import { applyCodeFix } from '../autofix/diff-generator.js';
import { getFlakyTestMetrics } from '../db/history.js';
import { AnalysisReport } from '../types.js';

export function startDashboardServer(
  port: number = 3000,
  latestReport?: AnalysisReport
): express.Express {
  const app = express();
  app.use(express.json());

  // API endpoints
  app.get('/api/report', (_req, res) => {
    if (latestReport) {
      return res.json(latestReport);
    }
    // Try loading latest output report if available
    const reportPath = path.resolve(process.cwd(), 'output/real-test-report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        return res.json(report);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to read report' });
      }
    }
    res.status(404).json({ error: 'No analysis report found' });
  });

  app.get('/api/flaky', (_req, res) => {
    const metrics = getFlakyTestMetrics();
    res.json(metrics);
  });

  app.post('/api/apply-fix', (req, res) => {
    const { codeFix } = req.body;
    if (!codeFix) {
      return res.status(400).json({ success: false, error: 'codeFix payload required' });
    }
    const success = applyCodeFix(codeFix);
    res.json({ success });
  });

  // Serve Dashboard Web UI
  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHtml());
  });

  app.listen(port, () => {
    console.log(`\n🚀 AI Failure Analysis Web Dashboard running at: http://localhost:${port}`);
  });

  return app;
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Failure Analysis Copilot — Live Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(23, 31, 48, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.4);
      --accent-red: #ef4444;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 2rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.8rem; font-weight: 700; background: linear-gradient(135deg, #a5b4fc, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .badge { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); padding: 0.3rem 0.8rem; borderRadius: 20px; font-size: 0.85rem; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.2rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; backdrop-filter: blur(12px); }
    .card h3 { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .val { font-size: 2.2rem; font-weight: 700; color: #fff; }
    .failure-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .failure-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .test-name { font-size: 1.2rem; font-weight: 600; color: #f8fafc; }
    .category-tag { padding: 0.3rem 0.8rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
    .diff-box { background: #050811; border-radius: 8px; padding: 1rem; font-family: monospace; font-size: 0.85rem; overflow-x: auto; margin-top: 1rem; color: #cbd5e1; white-space: pre-wrap; }
    .btn-apply { background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 1rem; }
    .btn-apply:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🤖 AI Failure Analysis Copilot</h1>
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0.2rem;">Live Failure Triage & Self-Healing Web Dashboard</p>
    </div>
    <span class="badge">Live Server Active</span>
  </header>

  <div class="grid">
    <div class="card">
      <h3>Analyzed Failures</h3>
      <div class="val" id="totalFailures">--</div>
    </div>
    <div class="card">
      <h3>Root Cause Accuracy</h3>
      <div class="val" style="color: #818cf8;">High Confidence</div>
    </div>
    <div class="card">
      <h3>Flaky Test Risk</h3>
      <div class="val" id="flakyCount" style="color: var(--accent-amber);">--</div>
    </div>
  </div>

  <h2 style="margin-bottom: 1rem; font-size: 1.3rem;">🚨 Triaged Test Failures</h2>
  <div id="failuresList">Loading analysis data...</div>

  <script>
    async function loadDashboard() {
      try {
        const res = await fetch('/api/report');
        const report = await res.json();
        
        document.getElementById('totalFailures').innerText = report.totalFailures || 0;
        
        const container = document.getElementById('failuresList');
        if (!report.analyses || report.analyses.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted);">No failures found in recent report.</p>';
          return;
        }

        container.innerHTML = report.analyses.map((a, i) => \`
          <div class="failure-card">
            <div class="failure-header">
              <div class="test-name">\${a.testName}</div>
              <span class="category-tag">\${a.category} (\${a.confidence} Confidence)</span>
            </div>
            <p style="margin-bottom: 0.8rem; color: #e2e8f0; line-height: 1.5;"><strong>Diagnosis:</strong> \${a.explanation}</p>
            <p style="margin-bottom: 0.8rem; color: #a5b4fc;"><strong>Suggested Fix:</strong> \${a.suggestedAction}</p>
            
            \${a.codeFix ? \`
              <h4 style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-muted);">Proposed Code Fix Diff (\${a.codeFix.targetFile}):</h4>
              <div class="diff-box">\${escapeHtml(a.codeFix.unifiedDiff)}</div>
              <button class="btn-apply" onclick='applyFix(\${JSON.stringify(a.codeFix)})'>⚡ Apply Code Fix to File</button>
            \` : ''}
          </div>
        \`).join('');
      } catch (err) {
        document.getElementById('failuresList').innerHTML = '<p style="color: var(--accent-red);">Failed to load dashboard report data.</p>';
      }

      try {
        const flakyRes = await fetch('/api/flaky');
        const flakyData = await flakyRes.json();
        document.getElementById('flakyCount').innerText = flakyData.length || 0;
      } catch {}
    }

    async function applyFix(codeFix) {
      try {
        const res = await fetch('/api/apply-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeFix }),
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ Code fix successfully applied to file on disk!');
          loadDashboard();
        } else {
          alert('❌ Failed to apply code fix.');
        }
      } catch (err) {
        alert('Error applying fix: ' + err.message);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    loadDashboard();
  </script>
</body>
</html>`;
}
