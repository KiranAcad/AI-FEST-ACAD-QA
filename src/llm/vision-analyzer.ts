import fs from 'fs';
import path from 'path';
import { ParsedFailure } from '../types.js';

/**
 * Perform vision screenshot analysis using Ollama vision model or Claude API.
 */
export async function analyzeScreenshot(
  failure: ParsedFailure,
  provider: 'ollama' | 'anthropic' = 'ollama',
  ollamaUrl: string = 'http://localhost:11434',
  model?: string
): Promise<string | undefined> {
  if (!failure.screenshotPath || !fs.existsSync(failure.screenshotPath)) {
    return undefined;
  }

  try {
    const imageBuffer = fs.readFileSync(failure.screenshotPath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = failure.screenshotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    if (provider === 'ollama') {
      const visionModel = model || 'llava';
      const prompt = `Analyze this test failure screenshot alongside the error message: "${failure.errorMessage}".
Describe what is visible on the screen, any error popups, unexpected dialog overlays, missing elements, or layout issues. Keep response concise (2-3 sentences).`;

      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          prompt,
          images: [base64Image],
          stream: false,
        }),
      });

      if (!response.ok) {
        return `[Vision analysis unavailable using model ${visionModel}]`;
      }

      const data = (await response.json()) as { response?: string };
      return data.response?.trim() || '[No visual issues detected]';
    }
  } catch (err) {
    console.warn(`Vision analysis failed for ${failure.screenshotPath}:`, err);
  }

  return undefined;
}
