import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AnalysisReport, FailureAnalysis } from '../types.js';

/**
 * Inject AI Triage markdown reports into Allure result files as custom attachments.
 */
export function injectAllureAttachments(
  allureDir: string,
  report: AnalysisReport
): number {
  if (!fs.existsSync(allureDir)) {
    console.warn(`Allure directory does not exist: ${allureDir}`);
    return 0;
  }

  let injectedCount = 0;
  const files = fs.readdirSync(allureDir);
  const resultFiles = files.filter(f => f.endsWith('-result.json'));

  const analysisMap = new Map<string, FailureAnalysis>();
  for (const a of report.analyses) {
    analysisMap.set(a.testName, a);
  }

  for (const file of resultFiles) {
    const filePath = path.join(allureDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      const testName = data.name;
      const fullTestName = data.fullName ? `${data.fullName} > ${data.name}` : data.name;

      const analysis = analysisMap.get(testName) || analysisMap.get(fullTestName);
      if (analysis && (data.status === 'failed' || data.status === 'broken')) {
        // Create attachment file
        const attachmentId = crypto.randomBytes(8).toString('hex');
        const attachmentFileName = `${attachmentId}-attachment.md`;
        const attachmentPath = path.join(allureDir, attachmentFileName);

        const markdownContent = `
# 🤖 AI Failure Analysis Copilot Diagnosis

**Root Cause Category:** ${analysis.category}  
**Confidence:** ${analysis.confidence}  

## 💡 Explanation
${analysis.explanation}

## 🔧 Suggested Action
${analysis.suggestedAction}

## 📋 Relevant Log Excerpt
\`\`\`
${analysis.relevantLogExcerpt}
\`\`\`
${analysis.codeFix ? `\n## 🛠️ Auto-Fix Code Diff\n\`\`\`diff\n${analysis.codeFix.unifiedDiff}\n\`\`\`\n` : ''}
`;

        fs.writeFileSync(attachmentPath, markdownContent.trim(), 'utf-8');

        // Attach to Allure JSON
        if (!Array.isArray(data.attachments)) {
          data.attachments = [];
        }

        // Avoid duplicate AI attachment
        data.attachments = data.attachments.filter((att: { name?: string }) => att.name !== '🤖 AI Triage Report');

        data.attachments.push({
          name: '🤖 AI Triage Report',
          source: attachmentFileName,
          type: 'text/markdown',
        });

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        injectedCount++;
      }
    } catch (err) {
      console.warn(`Failed to inject Allure attachment into ${file}:`, err);
    }
  }

  return injectedCount;
}
