import fs from 'fs';
import path from 'path';
import * as diff from 'diff';
import { CodeFixSuggestion, ParsedFailure } from '../types.js';

/**
 * Extract failing file content and generate suggested code fix diff.
 */
export function generateCodeFix(
  failure: ParsedFailure,
  suggestedAction: string
): CodeFixSuggestion | undefined {
  if (!failure.filePath || !fs.existsSync(failure.filePath)) {
    // If relative path, try resolving against CWD
    const resolvedPath = path.resolve(process.cwd(), failure.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return undefined;
    }
    failure.filePath = resolvedPath;
  }

  try {
    const fileContent = fs.readFileSync(failure.filePath, 'utf-8');
    const lines = fileContent.split('\n');

    let targetLine = failure.errorLocation?.line || 1;
    if (targetLine > lines.length) targetLine = lines.length;

    // Grab surrounding 5 lines context
    const startLine = Math.max(1, targetLine - 2);
    const endLine = Math.min(lines.length, targetLine + 2);

    const originalLines = lines.slice(startLine - 1, endLine);
    const originalCode = originalLines.join('\n');

    // Simple heuristic fix generator or LLM replacement
    let replacementCode = originalCode;

    // Locator fix heuristics
    if (failure.errorMessage.includes('Timeout') || failure.errorMessage.includes('waiting for locator')) {
      const locatorMatch = failure.errorMessage.match(/waiting for locator\('(.*?)'\)/) || 
                           failure.errorMessage.match(/locator\('(.*?)'\)/);
      if (locatorMatch) {
        const wrongLocator = locatorMatch[1];
        // Example locator fix heuristic
        if (wrongLocator.includes('#login-button-wrong')) {
          replacementCode = originalCode.replace('#login-button-wrong', '#login-button');
        } else if (wrongLocator.includes('#submit-btn-wrong')) {
          replacementCode = originalCode.replace('#submit-btn-wrong', '#submit-button');
        } else {
          // Add explicit timeout or locator adjustment suggestion
          replacementCode = originalCode.replace(/await page\.click\((.*?)\)/, `await page.click($1, { timeout: 10000 })`);
        }
      }
    }

    if (originalCode === replacementCode) {
      // General fallback fix comment suggestion
      replacementCode = `// AI Suggested Fix: ${suggestedAction}\n` + originalCode;
    }

    const unifiedDiff = diff.createTwoFilesPatch(
      failure.filePath,
      failure.filePath,
      originalCode,
      replacementCode,
      'Original Code',
      'AI Proposed Fix'
    );

    return {
      targetFile: failure.filePath,
      startLine,
      endLine,
      originalCode,
      replacementCode,
      unifiedDiff,
      explanation: suggestedAction,
    };
  } catch (err) {
    console.warn(`Failed to generate code fix for ${failure.filePath}:`, err);
    return undefined;
  }
}

/**
 * Apply the generated code fix directly to source code on disk.
 */
export function applyCodeFix(codeFix: CodeFixSuggestion): boolean {
  try {
    if (!fs.existsSync(codeFix.targetFile)) return false;

    const fileContent = fs.readFileSync(codeFix.targetFile, 'utf-8');
    const lines = fileContent.split('\n');

    const beforeLines = lines.slice(0, codeFix.startLine - 1);
    const afterLines = lines.slice(codeFix.endLine);

    const newContent = [...beforeLines, codeFix.replacementCode, ...afterLines].join('\n');
    fs.writeFileSync(codeFix.targetFile, newContent, 'utf-8');
    return true;
  } catch (err) {
    console.error(`Failed to apply code fix to ${codeFix.targetFile}:`, err);
    return false;
  }
}
