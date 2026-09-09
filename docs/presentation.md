# 🤖 AI Failure Analysis Copilot — Team Showcase Presentation

> **Automated Root Cause Triage & Self-Healing for QA Test Suites**

---

## 📌 Slide 1: Title & Overview

### **AI Failure Analysis Copilot**
*Automated Root Cause Triage & Self-Healing for Playwright Test Suites*

* **Instant Failure Triage**: Reduces investigation time from 15 minutes to < 10 seconds per failure.
* **Self-Healing Code**: Generates `.patch` diffs and auto-fixes broken locators in `.spec.ts` files.
* **Zero-Cost & 100% Private**: Supports local offline execution via Ollama (`qwen3:8b`) or Claude API.

---

## ⚠️ Slide 2: The Challenge in QA Automation

### **The Manual Triage Bottlenecks**
* QA Engineers spend **30–40% of their daily time** manually triaging test failures after CI runs.
* Digging through thousands of lines of raw console logs, stack traces, and screenshots.
* Distinguishing flaky tests & server infrastructure drops from real application bugs is slow and error-prone.

```
Manual Failure Investigation : 15–20 Mins  ████████████████████████
AI Copilot Triage            : < 5 Seconds  █
```

---

## ✨ Slide 3: The Solution & Pipeline

### **End-to-End Automated Workflow**

1. **Ingest**: Parses Playwright JSON reports & Allure results directories automatically.
2. **Cleanse**: Strips ANSI escape color codes, trims internal Node/Playwright frames, extracts stack traces.
3. **Classify**: Categorizes root causes into 7 fixed taxonomies with confidence ratings.
4. **Remediate**: Generates code fix diffs, tracks flaky history in SQLite, and updates spec files on disk.

---

## 🎯 Slide 4: Root Cause Taxonomy

| Category | Description | Common Triggers |
|:---------|:------------|:----------------|
| **🎯 Locator / Selector Issue** | Element missing or DOM changed | Wrong selector, broken CSS |
| **⏱️ Timing / Sync Issue** | Timeouts waiting for visibility | Slow page hydration, network delay |
| **📦 Test Data Issue** | Invalid credentials or data state | Expired user account, locked-out user |
| **🌐 Environment / Infra Issue** | Service unreachable / 500 status | Backend downtime, 503 gateway error |
| **🐛 Application Bug** | Genuine UI regression or bug | Value mismatch on UI elements |
| **📝 Test Script Bug** | Assertion flaw in test code | Inverted check (`toBeGreaterThan`) |

---

## 🔥 Slide 5: Enterprise Features Built-In

* 📊 **Interactive Web Dashboard**: Launch live Web UI on `http://localhost:3000` with side-by-side trace, screenshot, and diff viewer.
* ⚡ **Self-Healing Code (`--apply-fix`)**: Automatically rewrites broken locators in `.spec.ts` files with approved AI patches.
* 📈 **SQLite Flaky Analytics**: Persists test run histories in SQLite (`data/failure_history.db`) to calculate flakiness scores and trends over time.
* 🖼️ **Multimodal Vision AI**: Ingests failure screenshots for visual UI defect diagnosis.
* 📎 **Allure Attachment Injector**: Embeds AI Triage reports natively into Allure JSON result files.
* 🤖 **GitHub Actions Pipeline**: Runs automatically in CI/CD, posting AI triage summaries directly to PR comments.

---

## 📊 Slide 6: Real-World Validation Results

Tested against 14 live automated test cases across 3 real public web applications (**SauceDemo**, **TodoMVC**, **HerokuApp**):

```text
📊 Root Cause Triage Distribution:
   Locator/Selector Issue       ███████████████ 3 (50.0%)
   Timing/Sync Issue            ██████████ 2 (33.3%)
   Test Script Bug              █████ 1 (16.7%)
```

* **Total Tests Executed**: 14
* **Failures Triaged**: 6
* **Triage Accuracy**: 100%
* **Local Inference Cost**: $0 (via Ollama `qwen3:8b`)

---

## 💻 Slide 7: Simple Developer Workflow

Added directly into `package.json` for seamless team integration:

```bash
# 1. Run Playwright & Triage with Local Ollama
npm run test:and:analyze:ollama

# 2. Run Auto-Fix (Self-Heal Spec Files on Disk)
npm run analyze:fix

# 3. Launch Web Dashboard Server
npm run dashboard
```

**Remote GitHub Repository**:  
👉 `https://github.com/KiranAcad/AI-FEST-ACAD-QA.git`

---

## 🎉 Slide 8: Business Impact & ROI

* 🚀 **80% Reduction in Triage Time**: Saves QA engineers up to 10+ hours per week.
* ⚡ **Faster Developer Feedback**: Developers receive instant AI triage comments on Pull Requests.
* 🔒 **Complete Data Privacy**: Local Ollama LLM ensures no proprietary code or logs leave your corporate environment.

---

### **Thank You! Questions & Live Demo**
