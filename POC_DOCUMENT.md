# 🤖 AI Failure Analysis Copilot — Executive 1-Page Summary

> **An automated AI assistant that triages failed software tests in seconds with root-cause diagnosis & suggested fixes.**
> 
> * **Engine:** Microsoft Playwright
> * **AI Intelligence:** Local Ollama (`qwen2.5-coder` / 100% Offline & Free)
> * **Test Suite Scope:** 60 Real E2E Tests across 7 Web Apps & APIs
> * **Data Privacy:** 100% On-Premise / Zero Cloud Data
> * **Status:** Verified & Operational • September 2026

---

### 📌 Quick Stats at a Glance
| Metric | Value | Meaning |
| :--- | :---: | :--- |
| **Tests Evaluated** | **60** | Across 7 real public web applications & APIs |
| **Failures Triaged** | **44** | 100% root-cause coverage (0 unclassified) |
| **Triage Speed** | **~2.5 min** | vs. ~11 to 14 hours of manual QA engineer labor |
| **Running Cost** | **$0.00** | 100% offline & local AI via Ollama |

---

## 💡 1. What This Tool Is About

When automated tests fail in a software project, engineers usually waste **10 to 15 hours every week** reading cryptic error messages, opening screenshots, and trying to figure out what broke.

👉 **This tool automatically reads the failure logs and screenshots, tells you the exact root cause in 3 seconds (e.g., Real Application Bug vs. Changed Button Selector vs. Slow Network Timeout), and suggests how to fix the code.**

* ⚡ **3-Sec AI Triage**: Fast root-cause classification per failure.
* 🖼️ **Screenshot Vision Diagnostics**: Computer vision inspects popups, modals, and 404 pages.
* 📈 **Flaky Stability Score**: Historical SQLite tracking to spot unreliable tests.
* 🛠️ **1-Click Code Fix Diff**: Unified git diffs generated for locators and timeouts.

---

## 📊 2. The Proof (Real Test Run)

We evaluated a realistic suite of **60 Playwright tests** across 7 web apps and APIs (DemoQA, SauceDemo, AutomationExercise, Reqres.in API, GitHub, and JSONPlaceholder):

### Failure Category Breakdown (44 Triaged Failures):
* 🐛 **Application Bug**: `17 (39%)` — Real defect in the application under test (e.g. 500 server crash, unexpected error banner).
* 🎯 **Locator / Selector**: `15 (34%)` — The web page changed its button ID, CSS class, or XPath.
* ⏳ **Timing / Sync Issue**: `7 (16%)` — The page or API was slow, exceeding the test timeout.
* 🌐 **Environment / Infra**: `2 (5%)` — Server down, network glitch, or 502 Bad Gateway.
* 📝 **Test Script Bug**: `2 (5%)` — Incorrect assertion or syntax error in test code.
* 📊 **Test Data Issue**: `1 (2%)` — Expected user account or record missing from test database.

### Performance Summary:
* **Total Tests Evaluated**: 60 Tests
* **Passing Tests**: 16 Passed (26.7%)
* **Failures Triaged**: 44 Failures (73.3%)
* **Classification Coverage**: 100% (0 Unclassified)
* **AI Triage Duration**: ~2.5 Minutes (~3.4 seconds per failure)
* **Cloud API Bill**: $0.00 (Zero cloud fees, runs locally)

---

## 🚀 3. How to Use This Tool (3 Simple Steps)

### Step 1: Start the Dashboard
Open your terminal and run:
```bash
npm run dashboard
```

### Step 2: Open in Browser
Navigate to:
```text
http://localhost:3000
```

### Step 3: Click & Run
1. Navigate to the **🧪 Run Tests** tab.
2. Click **⚡ Run Tests & Analyze**.
3. Watch the terminal stream tests live, followed immediately by the AI failure-by-failure triage!

---

## 🔍 4. From Where Did We Get This? (Architecture & Sources)

1. **Testing Framework (Microsoft Playwright)**:
   * Modern, reliable end-to-end automation engine executing real tests across Chromium, capturing console logs, DOM traces, and failure screenshots.
2. **AI Intelligence Engine (Local Ollama)**:
   * Runs high-performance open-source coding models (`qwen2.5-coder` / `deepseek-coder`) **100% locally on your computer**.
   * **Privacy First**: Proprietary source code, customer data, and credentials **never leave your machine**.
3. **Real Test Targets (Public Applications & APIs)**:
   * Tested against real-world applications including DemoQA, SauceDemo (Swag Labs), AutomationExercise, Reqres.in REST API, and JSONPlaceholder.

### 🛠️ Complete Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Test Automation Framework** | **Playwright + TypeScript** (`@playwright/test`) | Multi-browser (Chromium) E2E test execution, logs & screenshot capture |
| **AI / LLM Inference** | **Local Ollama** (`qwen2.5-coder`, `llama3`) | 100% offline root-cause triage, vision analysis, $0 cloud bills |
| **Backend API & Server** | **Node.js + Express 5 + TypeScript** (`tsx`) | Test process manager, REST API, report generator |
| **Live Streaming** | **Server-Sent Events (SSE)** | Real-time failure-by-failure triage streaming to dashboard |
| **History & Analytics DB** | **SQLite** (`better-sqlite3`) | Historical flaky test scoring (0–100%) and run frequency tracking |
| **Code Auto-Fix Engine** | **Diff Library** (`diff`) + **Zod** | Generates unified git diffs with automated `.bak` safe rollbacks |
| **Frontend UI Dashboard** | **HTML5 + CSS3 (Glassmorphism) + Vanilla JS** | Web dashboard (`localhost:3000`), interactive triage cards, report viewer |
| **Report Generators** | **Custom HTML, JSON, and Markdown** | Generates standalone interactive HTML (77 KB), CI/CD JSON, and PR-ready MD |

---

## 📖 5. Step-by-Step User Guide (Setup, Start & Use)

### 1. How to Pull the Code
Clone the official repository from GitHub using Git:
```bash
git clone https://github.com/KiranAcad/AI-FEST-ACAD-QA.git
cd AI-FEST-ACAD-QA
```
* **Repository:** `https://github.com/KiranAcad/AI-FEST-ACAD-QA.git`
* **Default Branch:** `master`

### 2. Prerequisites & Installation
Ensure you have **Node.js >= 18.0.0** and **Git** installed on your system.
```bash
# Install project dependencies
npm install

# (Optional) Ensure Ollama is running locally with coding model
ollama pull qwen2.5-coder:1.5b
```

### 3. How to Start the Project
Launch the local web dashboard server:
```bash
npm run dashboard
```
Once started, open your web browser and navigate to:
👉 **`http://localhost:3000`**

### 4. How to Use the Tool (Dashboard Features)
The dashboard provides 4 core workflow tabs:
* **📊 Dashboard**: High-level executive metrics, failure distribution charts, and flaky test stability rankings.
* **🚨 Failure Triage**: Browse all triaged failures, view detailed AI explanations, inspect full-page screenshots, and view/apply code fix diffs.
* **🧪 Run Tests**: 1-click **"⚡ Run Tests & Analyze"** button. The embedded terminal streams test execution followed immediately by live, failure-by-failure AI triage!
* **📑 Reports**: Browse, preview, and download standalone interactive HTML reports (77 KB), JSON data feeds, or Markdown summaries.

### 5. CLI Command Cheat Sheet
| Command | What It Does |
| :--- | :--- |
| `npm run dashboard` | Starts the interactive web dashboard on `http://localhost:3000` |
| `npm run test:real` | Runs all 60 Playwright tests and generates `results.json` |
| `npm run analyze:ollama` | Runs batch AI triage from CLI using local Ollama model |
| `npm run test:and:analyze:ollama` | End-to-end automated pipeline: executes tests and triages failures |

---

> 📄 **Single Definitive PDF**: **[`POC_GUIDE.pdf`](file:///c:/AI%20Failure%20analysis/POC_GUIDE.pdf)** (Executive Summary, Proof, Tech Stack & Complete User Guide).


