import fs from 'fs';
import path from 'path';
import { ParsedFailure } from '../types.js';
import { stripAnsi } from './playwright-parser.js';

export interface AllureParserResult {
  totalTests: number;
  failures: ParsedFailure[];
}

export function parseAllureResultsDir(allureDir: string): AllureParserResult {
  if (!fs.existsSync(allureDir)) {
    throw new Error(`Allure results directory not found: ${allureDir}`);
  }

  const files = fs.readdirSync(allureDir);
  const resultFiles = files.filter(f => f.endsWith('-result.json'));

  let totalTests = 0;
  const failures: ParsedFailure[] = [];

  for (const file of resultFiles) {
    const filePath = path.join(allureDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      totalTests++;

      const status = data.status?.toLowerCase();
      if (status === 'failed' || status === 'broken') {
        const testName = data.name || 'Unnamed Allure Test';
        const suiteName = data.fullName || data.historyId || 'Allure Suite';
        
        // Extract failure message & trace
        const rawMessage = data.statusDetails?.message || 'No error message';
        const rawTrace = data.statusDetails?.trace || '';

        const errorMessage = stripAnsi(rawMessage);
        const stackTrace = stripAnsi(rawTrace);

        // Find attachments (screenshots, videos, logs)
        let screenshotPath: string | undefined;
        let videoPath: string | undefined;
        const logLines: string[] = [];

        if (Array.isArray(data.attachments)) {
          for (const att of data.attachments) {
            const attPath = path.join(allureDir, att.source);
            if (att.type?.includes('image/') || att.name?.toLowerCase().includes('screenshot')) {
              if (fs.existsSync(attPath)) screenshotPath = attPath;
            } else if (att.type?.includes('video/') || att.name?.toLowerCase().includes('video')) {
              if (fs.existsSync(attPath)) videoPath = attPath;
            } else if (att.type?.includes('text/') || att.name?.toLowerCase().includes('log')) {
              if (fs.existsSync(attPath)) {
                try {
                  const logContent = fs.readFileSync(attPath, 'utf-8');
                  logLines.push(...logContent.split('\n'));
                } catch {
                  // ignore unreadable log attachment
                }
              }
            }
          }
        }

        // Try extracting code location from stacktrace
        let errorLocation: ParsedFailure['errorLocation'];
        const lineMatch = stackTrace.match(/at\s+.*?\((.*?):(\d+):(\d+)\)/) || stackTrace.match(/at\s+(.*?):(\d+):(\d+)/);
        if (lineMatch) {
          errorLocation = {
            file: lineMatch[1],
            line: parseInt(lineMatch[2], 10),
            column: parseInt(lineMatch[3], 10),
          };
        }

        failures.push({
          testName,
          suiteName,
          filePath: errorLocation?.file || 'unknown-file.spec.ts',
          errorMessage,
          stackTrace,
          logLines: logLines.slice(-30),
          screenshotPath,
          videoPath,
          duration: data.stop && data.start ? data.stop - data.start : 0,
          retries: 0,
          errorLocation,
        });
      }
    } catch (err) {
      console.warn(`Failed to parse allure result file ${file}:`, err);
    }
  }

  return { totalTests, failures };
}
