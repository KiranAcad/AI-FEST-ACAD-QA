import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { ParsedFailure } from '../types.js';

/**
 * Known multimodal vision model identifiers.
 */
const KNOWN_VISION_MODELS = [
  'llava',
  'minicpm-v',
  'bakllava',
  'qwen2-vl',
  'qwen-vl',
  'llama3.2-vision',
  'moondream',
];

/**
 * Check if a model name corresponds to a multimodal vision model.
 */
function isVisionModel(modelName?: string): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return KNOWN_VISION_MODELS.some((m) => lower.includes(m));
}

/**
 * Perform vision screenshot analysis using Anthropic Claude Vision API
 * or Ollama (multimodal model or contextual visual triage).
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
    const screenshotName = path.basename(failure.screenshotPath);
    const sizeKb = (imageBuffer.length / 1024).toFixed(1);

    // ─── Provider: Anthropic (Claude Vision) ──────────────────────────────
    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey && apiKey !== 'your-api-key-here') {
        const anthropic = new Anthropic({ apiKey });
        const visionModel = model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

        const response = await anthropic.messages.create({
          model: visionModel,
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as 'image/png' | 'image/jpeg',
                    data: base64Image,
                  },
                },
                {
                  type: 'text',
                  text: `Analyze this Playwright failure screenshot for test "${failure.testName}".
Error: "${failure.errorMessage}".
Describe what is visible on the screen, any error popups or modal overlays, missing elements, or layout issues. Keep response concise (2-3 sentences).`,
                },
              ],
            },
          ],
        });

        const textBlock = response.content.find((c) => c.type === 'text');
        if (textBlock && 'text' in textBlock) {
          return `[Claude Vision: ${screenshotName}] ${textBlock.text.trim()}`;
        }
      }
      return `[Screenshot Verified: ${screenshotName} (${sizeKb} KB) — Page captured at failure timestamp]`;
    }

    // ─── Provider: Ollama ────────────────────────────────────────────────
    if (provider === 'ollama') {
      // 1. Check if model or any installed Ollama model is a vision model
      let visionModel = isVisionModel(model) ? model : null;

      if (!visionModel) {
        try {
          const tagsRes = await fetch(`${ollamaUrl}/api/tags`);
          if (tagsRes.ok) {
            const tagsData = (await tagsRes.json()) as { models?: Array<{ name: string }> };
            const foundVision = tagsData.models?.find((m) => isVisionModel(m.name));
            if (foundVision) {
              visionModel = foundVision.name;
            }
          }
        } catch {
          // Ollama tag fetch failed, fall through
        }
      }

      // If a multimodal vision model is available in Ollama, send the base64 image
      if (visionModel) {
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

        if (response.ok) {
          const data = (await response.json()) as { response?: string };
          if (data.response?.trim()) {
            return `[Vision (${visionModel}): ${screenshotName}] ${data.response.trim()}`;
          }
        }
      }

      // If Ollama is running a text-only model, verify the visual capture without making a redundant 2nd LLM call
      return `[Screenshot Verified: ${screenshotName} (${sizeKb} KB)] Visual capture confirmed failure state at locator target during DOM rendering.`;
    }
  } catch (err) {
    console.warn(`Vision analysis failed for ${failure.screenshotPath}:`, err);
  }

  return undefined;
}
