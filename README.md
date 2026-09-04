# AI Failure Analysis Copilot (POC)

> **AI-powered root cause analysis for failed Playwright tests.**
> Feed it your test results → get categorized failure triage with suggested actions.

---

## What It Does

This tool takes failed Playwright test results and uses Claude AI to automatically:

1. **Parse** the Playwright JSON reporter output
2. **Classify** each failure into one of 7 root cause categories
3. **Explain** why the failure happened with specific evidence
4. **Suggest** concrete next actions for the QA engineer
5. **Generate** a professional HTML/Markdown report grouped by category

### Root Cause Categories

| Category | Description |
|:---------|:------------|
| 🎯 **Locator/Selector Issue** | Element not found, changed DOM, stale selector |
| ⏱️ **Timing/Sync Issue** | Timeout, race condition, flaky wait |
| 📦 **Test Data Issue** | Invalid/stale/expired test data |
| 🌐 **Environment/Infra Issue** | Network, server down, config |
| 🐛 **Application Bug** | Genuine functional defect |
| 📝 **Test Script Bug** | Assertion logic error, wrong selector in test |
| ❓ **Unknown/Needs Manual Review** | Insufficient info for classification |

---

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **Anthropic API key** (optional — tool includes a dry-run mock mode)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (if using Claude API)
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Usage

### Basic (dry-run mode, no API key needed)

```bash
npm run analyze -- --input ./fixtures/sample-playwright-results.json --output ./output/report --dry-run
```

### With Local Open-Source LLM (Ollama — 100% Free & Offline)

```bash
# Analyze with your local Ollama model (e.g. qwen3:8b, llama3.2, etc.)
npm run analyze -- --provider ollama --model qwen3:8b

# Or run the shortcut:
npm run analyze:ollama
```

### With Cloud Claude API

```bash
npm run analyze -- --input ./fixtures/sample-playwright-results.json --output ./output/report
```

### CLI Options

```
analyze [options]

Options:
  -i, --input <path>         Path to Playwright JSON results file (defaults to ./real-tests/test-results/results.json)
  -o, --output <path>        Output path for report (default: "./output/report")
  -p, --provider <provider>  LLM provider: "anthropic" or "ollama" (default: "anthropic")
  -m, --model <model>        Model name (e.g. "qwen3:8b", "claude-sonnet-4-20250514")
  -f, --format <format>      Report format: md, html, or both (default: "both")
  --ollama-url <url>         Base URL for Ollama (default: "http://127.0.0.1:11434")
  --dry-run                  Use mock analysis (no API key or local model needed)
  -h, --help                 Display help
```

### Example Output

```
  ╔══════════════════════════════════════════════╗
  ║   🔍 AI Failure Analysis Copilot (POC)      ║
  ╚══════════════════════════════════════════════╝

  ✓ Found 11 total test(s), 8 failure(s)

  📊 Root Cause Summary:

     Locator/Selector Issue       ███████ 2 (25.0%)
     Timing/Sync Issue            ███████ 2 (25.0%)
     Test Data Issue              ████   1 (12.5%)
     Environment/Infra Issue      ████   1 (12.5%)
     Application Bug              ████   1 (12.5%)
     Test Script Bug              ████   1 (12.5%)

  💰 Token usage: 12,450 input / 3,200 output ≈ $0.08
```

---

## Architecture

```
ai-failure-analysis-poc/
├── src/
│   ├── parsers/                # Input parsing
│   │   ├── playwright-parser.ts  # Playwright JSON reporter parser
│   │   └── index.ts              # Auto-detection & barrel export
│   ├── context/                # LLM prompt building
│   │   ├── prompt-builder.ts     # Token-efficient prompt construction
│   │   ├── system-prompt.ts      # Root cause taxonomy & analysis rules
│   │   └── index.ts
│   ├── llm/                    # LLM adapter (Claude API)
│   │   ├── analyzer.ts           # Single-failure analysis via Tool Use
│   │   ├── batch-analyzer.ts     # Batch orchestration + mock mode
│   │   └── index.ts
│   ├── report/                 # Report generation
│   │   ├── markdown-report.ts    # Markdown report with charts
│   │   ├── html-report.ts        # Styled HTML report
│   │   └── index.ts
│   ├── types.ts                # Shared type definitions
│   ├── cli.ts                  # CLI command definitions
│   └── index.ts                # Entry point
├── fixtures/                   # Sample test data
│   └── sample-playwright-results.json  (8 failures across 6 categories)
├── output/                     # Generated reports (gitignored)
├── docs/
│   └── what-this-saves.md      # Stakeholder pitch document
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### Key Design Decisions

- **Tool Use for structured output**: Claude's Tool Use (function calling) guarantees the response matches our Zod schema exactly — no fragile text parsing
- **Sequential processing**: One API call per failure for POC simplicity; can be parallelized later
- **Adapter pattern**: LLM calls are isolated behind a `createAnalyzer()` interface — swap models/providers by changing one file
- **Mock mode**: Full dry-run capability with heuristic-based classification for demos without API costs

---

## Sample Fixtures

The `fixtures/` directory contains a realistic Playwright JSON report with **8 failed tests**:

| # | Test | Expected Category |
|---|------|:-----------------|
| 1 | Login button locator changed | Locator/Selector Issue |
| 2 | Search results not visible | Locator/Selector Issue |
| 3 | Dashboard widgets timeout | Timing/Sync Issue |
| 4 | Modal close race condition (flaky) | Timing/Sync Issue |
| 5 | Expired coupon code | Test Data Issue |
| 6 | Inventory service 503 | Environment/Infra Issue |
| 7 | Cart total calculation wrong | Application Bug |
| 8 | Assertion on wrong price element | Test Script Bug |

---

## Current Limitations

- **Input format**: Only Playwright JSON reporter output is supported (Allure support planned)
- **No image analysis**: Screenshots are referenced but not analyzed
- **No history tracking**: Each run is independent; no flaky test history database
- **Sequential API calls**: One call per failure (acceptable for <20 failures, optimize for larger batches)
- **No CI/CD integration**: Manual CLI usage only

## Future Enhancements

- [ ] Allure result file parser
- [ ] CI/CD integration (GitHub Actions, Jenkins)
- [ ] Flaky test history tracking with SQLite
- [ ] Screenshot/video analysis for visual regression
- [ ] Custom Allure attachment injection
- [ ] Parallel API calls for large batches
- [ ] Web UI dashboard
- [ ] Auto-fix suggestions with code diffs

---

## License

Internal POC — not for external distribution.
