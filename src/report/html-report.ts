/**
 * HTML Report Generator
 *
 * Produces a styled, single-file HTML report with inline CSS.
 * Features color-coded confidence badges, category cards, and
 * expandable detail sections — suitable for sharing with stakeholders.
 */

import { AnalysisReport, FailureAnalysis, RootCauseCategory } from '../types.js';

/**
 * Generate a complete HTML report as a string.
 */
export function generateHtmlReport(report: AnalysisReport): string {
  const categoryCounts = countByCategory(report.analyses);
  const sortedCategories = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a);
  const passRate = ((1 - report.totalFailures / report.totalTests) * 100).toFixed(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Failure Analysis Report</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --bg-card-hover: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --border-color: #334155;
      --accent-blue: #3b82f6;
      --accent-purple: #8b5cf6;
      --accent-cyan: #06b6d4;
      --accent-green: #10b981;
      --accent-yellow: #f59e0b;
      --accent-red: #ef4444;
      --accent-orange: #f97316;
      --accent-pink: #ec4899;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2);
      --radius: 12px;
      --radius-sm: 8px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 2.5rem;
      padding: 2.5rem;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1a1a2e 100%);
      border-radius: var(--radius);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-lg);
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-cyan));
    }

    .header h1 {
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 1rem;
    }

    .header-meta {
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .meta-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .meta-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .meta-value.failures { color: var(--accent-red); }
    .meta-value.pass-rate { color: var(--accent-green); }

    /* Category Summary Cards */
    .section-title {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 2rem 0 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .category-card {
      background: var(--bg-card);
      border-radius: var(--radius);
      padding: 1.25rem;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .category-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .category-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .category-name {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .category-count {
      font-size: 1.75rem;
      font-weight: 800;
    }

    .category-bar {
      height: 6px;
      background: var(--bg-primary);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 0.75rem;
    }

    .category-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    .category-pct {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }

    /* Detailed Analysis Table */
    .analysis-group {
      margin-bottom: 2rem;
    }

    .analysis-group-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .analysis-card {
      background: var(--bg-card);
      border-radius: var(--radius-sm);
      padding: 1.25rem;
      margin-bottom: 0.75rem;
      border: 1px solid var(--border-color);
      transition: border-color 0.2s;
    }

    .analysis-card:hover {
      border-color: var(--accent-blue);
    }

    .analysis-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .test-name {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--accent-cyan);
      word-break: break-all;
    }

    .confidence-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }

    .confidence-high {
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .confidence-medium {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent-yellow);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .confidence-low {
      background: rgba(239, 68, 68, 0.15);
      color: var(--accent-red);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .analysis-field {
      margin-bottom: 0.6rem;
    }

    .analysis-field-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 0.2rem;
    }

    .analysis-field-value {
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .log-excerpt {
      background: var(--bg-primary);
      border-radius: var(--radius-sm);
      padding: 0.75rem 1rem;
      font-family: 'Consolas', 'Fira Code', monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--text-secondary);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      border: 1px solid var(--border-color);
    }

    /* Cost Footer */
    .cost-section {
      background: var(--bg-card);
      border-radius: var(--radius);
      padding: 1.5rem;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow);
      margin-top: 2rem;
    }

    .cost-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      text-align: center;
    }

    .cost-item-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent-blue);
    }

    .cost-item-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .footer {
      text-align: center;
      margin-top: 2rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* Responsive */
    @media (max-width: 640px) {
      body { padding: 1rem; }
      .header-meta { gap: 1rem; }
      .meta-value { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header -->
    <div class="header">
      <h1>🔍 AI Failure Analysis Report</h1>
      <div class="header-meta">
        <div class="meta-item">
          <span class="meta-label">Report Date</span>
          <span class="meta-value">${formatDate(report.timestamp)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Total Tests</span>
          <span class="meta-value">${report.totalTests}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Failures</span>
          <span class="meta-value failures">${report.totalFailures}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Pass Rate</span>
          <span class="meta-value pass-rate">${passRate}%</span>
        </div>
      </div>
    </div>

    <!-- Category Summary -->
    <div class="section-title">📊 Root Cause Distribution</div>
    <div class="category-grid">
      ${sortedCategories
        .map(([category, count], idx) => {
          const pct = ((count / report.totalFailures) * 100).toFixed(1);
          const color = CATEGORY_COLORS[category as RootCauseCategory] || 'var(--accent-blue)';
          const icon = CATEGORY_ICONS[category as RootCauseCategory] || '❓';
          return `
      <div class="category-card">
        <div class="category-card-header">
          <span class="category-name">${icon} ${escapeHtml(category)}</span>
          <span class="category-count" style="color: ${color}">${count}</span>
        </div>
        <div class="category-bar">
          <div class="category-bar-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
        <div class="category-pct">${pct}% of failures</div>
      </div>`;
        })
        .join('\n')}
    </div>

    <!-- Detailed Analysis -->
    <div class="section-title">📋 Detailed Analysis</div>
    ${sortedCategories
      .map(([category]) => {
        const categoryAnalyses = report.analyses.filter((a) => a.category === category);
        const icon = CATEGORY_ICONS[category as RootCauseCategory] || '❓';
        return `
    <div class="analysis-group">
      <div class="analysis-group-title">${icon} ${escapeHtml(category)} (${categoryAnalyses.length})</div>
      ${categoryAnalyses.map((a) => renderAnalysisCard(a)).join('\n')}
    </div>`;
      })
      .join('\n')}

    <!-- Token Usage & Cost -->
    <div class="cost-section">
      <div class="section-title" style="margin-top: 0">💰 Token Usage & Cost</div>
      <div class="cost-grid">
        <div>
          <div class="cost-item-value">${report.tokenUsage.inputTokens.toLocaleString()}</div>
          <div class="cost-item-label">Input Tokens</div>
        </div>
        <div>
          <div class="cost-item-value">${report.tokenUsage.outputTokens.toLocaleString()}</div>
          <div class="cost-item-label">Output Tokens</div>
        </div>
        <div>
          <div class="cost-item-value">${(report.tokenUsage.inputTokens + report.tokenUsage.outputTokens).toLocaleString()}</div>
          <div class="cost-item-label">Total Tokens</div>
        </div>
        <div>
          <div class="cost-item-value" style="color: var(--accent-green)">$${report.tokenUsage.estimatedCost.toFixed(4)}</div>
          <div class="cost-item-label">Estimated Cost</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Generated by AI Failure Analysis Copilot (POC) • ${formatDate(report.timestamp)}
    </div>
  </div>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function renderAnalysisCard(analysis: FailureAnalysis): string {
  const confClass =
    analysis.confidence === 'High' ? 'confidence-high' :
    analysis.confidence === 'Medium' ? 'confidence-medium' :
    'confidence-low';

  const confDot =
    analysis.confidence === 'High' ? '●' :
    analysis.confidence === 'Medium' ? '●' :
    '●';

  return `
      <div class="analysis-card">
        <div class="analysis-card-header">
          <span class="test-name">${escapeHtml(analysis.testName)}</span>
          <span class="confidence-badge ${confClass}">${confDot} ${analysis.confidence}</span>
        </div>
        <div class="analysis-field">
          <div class="analysis-field-label">Explanation</div>
          <div class="analysis-field-value">${escapeHtml(analysis.explanation)}</div>
        </div>
        <div class="analysis-field">
          <div class="analysis-field-label">Suggested Action</div>
          <div class="analysis-field-value">${escapeHtml(analysis.suggestedAction)}</div>
        </div>
        <div class="analysis-field">
          <div class="analysis-field-label">Relevant Log Excerpt</div>
          <div class="log-excerpt">${escapeHtml(analysis.relevantLogExcerpt)}</div>
        </div>
      </div>`;
}

const CATEGORY_COLORS: Record<RootCauseCategory, string> = {
  'Locator/Selector Issue': '#3b82f6',
  'Timing/Sync Issue': '#f59e0b',
  'Test Data Issue': '#8b5cf6',
  'Environment/Infra Issue': '#ef4444',
  'Application Bug': '#ec4899',
  'Test Script Bug': '#06b6d4',
  'Unknown/Needs Manual Review': '#64748b',
};

const CATEGORY_ICONS: Record<RootCauseCategory, string> = {
  'Locator/Selector Issue': '🎯',
  'Timing/Sync Issue': '⏱️',
  'Test Data Issue': '📦',
  'Environment/Infra Issue': '🌐',
  'Application Bug': '🐛',
  'Test Script Bug': '📝',
  'Unknown/Needs Manual Review': '❓',
};

function countByCategory(analyses: FailureAnalysis[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of analyses) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }
  return counts;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
