# 🤖 AI Failure Analysis Copilot

> **AI-powered root-cause analysis, vision screenshot diagnostics, and automated code fixes for Playwright test suites.**  
> Automatically turns cryptic error traces and screenshots into categorized triage, actionable fixes, and executive reports in seconds.

---

## 📌 Overview & Value Proposition

In modern agile development, automated test suites run continuously. When tests fail, **QA engineers and developers typically waste 10 to 15 hours every week** manually digging through 500-line stack traces, opening screenshots, and trying to determine why tests broke.

**The AI Failure Analysis Copilot** automates this entire diagnosis:
* ⏱️ **Instant Triage:** Classifies failures in **~3 seconds** instead of 15 minutes per test.
* 🎯 **Root-Cause Accuracy:** Separates genuine product bugs from broken CSS locators, timing lags, or infrastructure downtime.
* 🖼️ **Multimodal Computer Vision:** Inspects failure screenshots to detect modal dialogs, blocking popups, and unexpected 404/500 screens.
* 🛠️ **Automated Code Fixes:** Generates unified git diffs for broken locators and timeouts with 1-click safe rollback.
* 📈 **Flaky Test History:** Tracks stability trends over time in an embedded SQLite database with a **0–100% Stability Index**.
* 🔒 **100% Offline & Free:** Powered locally by **Ollama** (`qwen2.5-coder` / `llama3`). No data leaves your machine; **$0 cloud API costs**.

---

## 📊 Real-World Proof: 60-Test Demonstration

Validated on a realistic, multi-application suite of **60 Playwright tests** across 7 public web applications and REST APIs:

| Metric | Result | Description |
| :--- | :---: | :--- |
| **Total Tests Evaluated** | **60 Tests** | Across SauceDemo, DemoQA, AutomationExercise, Reqres API, etc. |
| **Passing Tests** | **16 Passed (26.7%)** | Clean executions across end-to-end user journeys |
| **Failures Triaged** | **44 Failures (73.3%)** | Real-world failure scenarios triaged with 100% coverage |
| **Triage Speed** | **~2.5 Minutes** | Entire suite triaged in minutes vs. **~11–14 hours** of manual labor |
| **Cloud API Bill** | **$0.00** | Ran 100% locally via open-source Ollama models |

### Failure Root-Cause Distribution (44 Triaged):
* 🐛 **Application Bug:** `17 (38.6%)` — Genuine functional defects or server crashes (e.g., HTTP 500).
* 🎯 **Locator / Selector Issue:** `15 (34.1%)` — Redesigned DOM elements, changed IDs, classes, or XPaths.
* ⏳ **Timing / Sync Issue:** `7 (15.9%)` — Slow page renders, animations, or API delays exceeding timeouts.
* 🌐 **Environment / Infra Issue:** `2 (4.5%)` — Network drops, DNS resolution failures, or 502/504 Bad Gateway.
* 📝 **Test Script Bug:** `2 (4.5%)` — Typos, invalid assertion logic, or setup/teardown mistakes in test code.
* 📊 **Test Data Issue:** `1 (2.3%)` — Missing, stale, or expired test accounts/records in database.

---

## 🛠️ Complete Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Test Automation Framework** | **Microsoft Playwright** (`@playwright/test` v1.62) + **TypeScript** | Cross-browser (Chromium) E2E test execution, logs, DOM traces & PNG screenshots |
| **AI & LLM Inference** | **Local Ollama** (`qwen2.5-coder`, `llama3`) | 100% offline root-cause triage and vision analysis ($0 cloud fees) |
| **Vision Diagnostics** | **Multimodal Vision Engine** | Inspects failure screenshots for modal popups, error banners, and UI overlays |
| **Backend API Server** | **Node.js** + **Express 5** + **TypeScript** (`tsx`) | Test process manager, REST endpoints, and report generators |
| **Real-Time Streaming** | **Server-Sent Events (SSE)** | Streams live terminal output and failure-by-failure triage progress to browser |
| **History & Analytics** | **SQLite** (`better-sqlite3`) | Embedded database tracking flaky test history and 0–100% stability scores |
| **Code Auto-Fix Engine** | **Diff Library** (`diff`) + **Zod** | Validates structured LLM outputs and generates unified git diffs with `.bak` backups |
| **Web Dashboard UI** | **HTML5 + CSS3 (Glassmorphism) + Vanilla JS** | Modern executive dashboard at `http://localhost:3000` with 6 interactive tabs |
| **Multi-Format Reports** | **Custom HTML, JSON & Markdown Generators** | Standalone interactive HTML reports (77 KB), CI/CD JSON feeds, and PR-ready Markdown |

---

## 🚀 Quick Start Guide

### 1. Pull the Code
```bash
git clone https://github.com/KiranAcad/AI-FEST-ACAD-QA.git
cd AI-FEST-ACAD-QA
```

### 2. Install Dependencies
Ensure you have **Node.js >= 18.0.0** installed:
```bash
npm install
```

### 3. (Optional) Setup Local AI with Ollama
For offline, zero-cost AI triage, install [Ollama](https://ollama.com/) and pull a coding model:
```bash
ollama pull qwen2.5-coder:1.5b
```
*(Note: A heuristic dry-run mock mode is also built-in for testing without any local model).*

### 4. Launch the Dashboard
```bash
npm run dashboard
```
Open your browser and navigate to:
👉 **`http://localhost:3000`**

---

## 🖥️ Dashboard Features (`http://localhost:3000`)

The web UI provides an intuitive 6-tab workflow:

1. **📊 Dashboard:** High-level executive KPIs, category distribution charts, pass/fail trends, and flaky stability rankings.
2. **🚨 Failure Triage:** Interactive failure cards displaying confidence scores, root-cause tags, plain-English explanations, and screenshot modals.
3. **📈 Flaky Analytics:** SQLite-backed test history showing execution counts, pass rates, and stability index scores.
4. **▶️ Run Analysis:** Trigger AI triage on existing test results with model selection and real-time streaming terminal.
5. **🧪 Run Tests:** 1-click **"⚡ Run Tests & Analyze"** pipeline that executes Playwright tests, captures artifacts, and immediately streams AI triage live.
6. **📑 Reports:** Executive hero banner with live metrics and 1-click buttons to preview or download interactive standalone HTML, JSON, and Markdown reports.

---

## ⌨️ CLI Command Cheat Sheet

| Command | Description |
| :--- | :--- |
| `npm run dashboard` | Starts the interactive web dashboard on `http://localhost:3000` |
| `npm run test:real` | Runs all 60 Playwright tests across 7 web apps and saves `results.json` |
| `npm run analyze:ollama` | Runs batch AI triage from CLI using local Ollama model |
| `npm run test:and:analyze:ollama` | Full automated pipeline: executes tests, captures failures, and generates reports |
| `npm run analyze:sample` | Fast dry-run analysis using mock heuristic classifier (no LLM required) |
| `npm run typecheck` | Validates TypeScript types across the entire codebase (`tsc --noEmit`) |

---

## 📁 Repository Structure

```
AI-FEST-ACAD-QA/
├── src/
│   ├── autofix/               # Code diff generator and safe backup/rollback
│   ├── db/                    # SQLite database for flaky history & stability scoring
│   ├── llm/                   # Ollama local runner, batch analyzer & vision diagnostics
│   ├── parsers/               # Playwright JSON reporter parser & trace extractor
│   ├── report/                # Standalone HTML, JSON, and Markdown report generators
│   └── server/                # Express 5 server (SSE streaming, REST APIs & dashboard UI)
│       ├── app.ts             # Express backend routes, process manager & report endpoints
│       └── dashboard.html     # Modern glassmorphism executive web dashboard UI
├── real-tests/                # Realistic test automation suite
│   ├── playwright.config.ts   # Playwright configuration (Chromium, parallel workers)
│   └── tests/                 # 60 Real E2E tests across 7 public websites & APIs
│       ├── demoqa.spec.ts
│       ├── saucedemo.spec.ts
│       ├── automationexercise.spec.ts
│       ├── reqres-api.spec.ts
│       ├── jsonplaceholder.spec.ts
│       ├── github.spec.ts
│       └── wikipedia.spec.ts
├── output/                    # Generated standalone reports (HTML, JSON, MD)
├── docs/                      # Executive documentation & HTML templates
├── POC_GUIDE.pdf              # Single definitive 2-page executive summary & user manual
├── POC_DOCUMENT.md            # Plain-English Proof of Concept summary
└── package.json               # Root dependencies & scripts
```

---

## 📄 Executive PDF Document

A printable, executive 2-page brief containing the problem statement, proof metrics, full tech stack, and step-by-step user guide is available in the repository root:

👉 **[`POC_GUIDE.pdf`](POC_GUIDE.pdf)**

---

## 🔒 Enterprise Privacy & Security

* **Zero Cloud Leakage:** All test traces, proprietary URLs, error messages, and customer test data stay inside your firewall.
* **Open-Source Freedom:** Runs on local commodity hardware via Ollama without third-party vendor lock-in or recurring cloud subscriptions.

---

## 📜 License

MIT License — Created for AI Failure Analysis Copilot POC.
