/**
 * Ollama Analyzer — Local Open-Source LLM Analyzer
 *
 * Calls a local Ollama instance (e.g. http://127.0.0.1:11434)
 * using its native REST API with format: 'json' to guarantee structured output.
 * Works completely offline with zero API fees.
 */

import { z } from 'zod';
import {
  ParsedFailure,
  FailureAnalysis,
  RootCauseCategory,
  ConfidenceLevel,
  ROOT_CAUSE_CATEGORIES,
  TokenUsage,
} from '../types.js';
import { buildFailurePrompt } from '../context/prompt-builder.js';
import { SYSTEM_PROMPT } from '../context/system-prompt.js';

const FailureAnalysisSchema = z.object({
  category: z.string().transform((val) => {
    // Normalization to handle minor variations from local models
    const matched = ROOT_CAUSE_CATEGORIES.find(
      (c) => c.toLowerCase() === val.trim().toLowerCase()
    );
    if (matched) return matched;
    // Partial matches
    if (/locator|selector|element/i.test(val)) return 'Locator/Selector Issue';
    if (/timing|timeout|sync|flak/i.test(val)) return 'Timing/Sync Issue';
    if (/data|credential|account/i.test(val)) return 'Test Data Issue';
    if (/infra|network|server|50/i.test(val)) return 'Environment/Infra Issue';
    if (/application|defect|app bug/i.test(val)) return 'Application Bug';
    if (/script|test bug|assertion/i.test(val)) return 'Test Script Bug';
    return 'Unknown/Needs Manual Review';
  }) as z.ZodType<RootCauseCategory>,
  confidence: z.string().transform((val) => {
    const v = val.toLowerCase();
    if (v.includes('high')) return 'High';
    if (v.includes('med')) return 'Medium';
    if (v.includes('low')) return 'Low';
    return 'Medium';
  }) as z.ZodType<ConfidenceLevel>,
  explanation: z.string(),
  suggested_action: z.string(),
  relevant_log_excerpt: z.string(),
});

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
}

export function createOllamaAnalyzer(config: OllamaConfig = {}) {
  const baseUrl = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = config.model || process.env.OLLAMA_MODEL || 'qwen3:1.7b';
  const maxRetries = config.maxRetries || 2;

const LOCAL_SYSTEM_PROMPT = `You are a QA failure triage specialist. Classify the test failure into exactly one category:
1. 'Locator/Selector Issue': element not found, changed selector, strict mode violation
2. 'Timing/Sync Issue': timeout, race condition, wait timeout
3. 'Test Data Issue': invalid/expired credentials or environment data
4. 'Environment/Infra Issue': 500/502/503 HTTP errors, network/connection refused
5. 'Application Bug': genuine functional defect in application
6. 'Test Script Bug': wrong test assertion or incorrect expected value
7. 'Unknown/Needs Manual Review': insufficient information

Respond ONLY with a JSON object:
{
  "category": "one of the 7 exact categories above",
  "confidence": "High" | "Medium" | "Low",
  "explanation": "concise 1-sentence reason",
  "suggested_action": "1-sentence recommended fix",
  "relevant_log_excerpt": "1-2 lines from the error"
}
CRITICAL: Output ONLY the raw JSON object. Do not output any <think> tags or reasoning text.`;

  async function analyzeFailure(
    failure: ParsedFailure
  ): Promise<{ analysis: FailureAnalysis; tokenUsage: TokenUsage }> {
    // Keep context concise for fast local inference
    const errorSnippet = failure.errorMessage.slice(0, 500);
    const stackSnippet = (failure.stackTrace || '').split('\n').slice(0, 5).join('\n');
    const logSnippet = failure.logLines.slice(-3).join('\n');

    const userPrompt = `Failed Test: ${failure.testName}
File: ${failure.filePath}
Error:
${errorSnippet}
${stackSnippet ? `Stack:\n${stackSnippet}` : ''}
${logSnippet ? `Recent Logs:\n${logSnippet}` : ''}

Output the JSON classification now:`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Set a 35-second timeout to prevent hanging
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35_000);

        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: LOCAL_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            format: 'json',
            stream: false,
            think: false, // Disable thinking/reasoning mode for faster inference
            keep_alive: '15m', // Keep model hot in RAM between requests
            options: {
              temperature: 0.1,
              num_predict: 160,
              num_ctx: 2048,
            },
          }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Ollama API returned HTTP ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          message?: { content: string };
          prompt_eval_count?: number;
          eval_count?: number;
        };

        const rawContent = data.message?.content?.trim() || '{}';
        let parsedJson: Record<string, unknown> = {};

        try {
          parsedJson = JSON.parse(rawContent);
        } catch {
          // If wrapped in markdown ```json ... ```
          const cleaned = rawContent.replace(/```(?:json)?/g, '').trim();
          try {
            parsedJson = JSON.parse(cleaned);
          } catch {
            // Regex fallback for truncated JSON
            const catMatch = rawContent.match(/"(?:category|root_cause|type)":\s*"([^"]+)"/i);
            const confMatch = rawContent.match(/"confidence":\s*"([^"]+)"/i);
            const expMatch = rawContent.match(/"explanation":\s*"([^"]+)"/i);
            const actMatch = rawContent.match(/"suggested_action":\s*"([^"]+)"/i);
            const excMatch = rawContent.match(/"relevant_log_excerpt":\s*"([^"]+)"/i);

            if (catMatch) {
              parsedJson = {
                category: catMatch[1],
                confidence: confMatch ? confMatch[1] : 'Medium',
                explanation: expMatch ? expMatch[1] : '',
                suggested_action: actMatch ? actMatch[1] : '',
                relevant_log_excerpt: excMatch ? excMatch[1] : '',
              };
            }
          }
        }

        // Resilient extraction for any open-source model JSON format
        const target = ((parsedJson.analysis || parsedJson.result || parsedJson.data || parsedJson) as Record<string, unknown>) || {};

        const rawCat = String(target.category || target.root_cause || target.rootCause || target.type || target.classification || '');
        const rawConf = String(target.confidence || target.certainty || 'Medium');
        const rawExp = String(target.explanation || target.reason || target.description || target.cause || 'Analysis completed by local model');
        const rawAction = String(target.suggested_action || target.suggestedAction || target.action || target.recommendation || target.fix || 'Review the failure logs and selector');
        const rawExcerpt = String(target.relevant_log_excerpt || target.relevantLogExcerpt || target.log_excerpt || target.excerpt || target.error || '');

        // Normalize category
        let category: RootCauseCategory = 'Unknown/Needs Manual Review';
        for (const c of ROOT_CAUSE_CATEGORIES) {
          if (c.toLowerCase() === rawCat.toLowerCase().trim()) {
            category = c;
            break;
          }
        }
        if (category === 'Unknown/Needs Manual Review') {
          if (/locator|selector|element/i.test(rawCat + rawExp)) category = 'Locator/Selector Issue';
          else if (/timing|timeout|sync|flak/i.test(rawCat + rawExp)) category = 'Timing/Sync Issue';
          else if (/data|credential|account/i.test(rawCat + rawExp)) category = 'Test Data Issue';
          else if (/infra|network|server|50/i.test(rawCat + rawExp)) category = 'Environment/Infra Issue';
          else if (/application|defect|app bug/i.test(rawCat + rawExp)) category = 'Application Bug';
          else if (/script|test bug|assertion/i.test(rawCat + rawExp)) category = 'Test Script Bug';
        }

        // Normalize confidence
        let confidence: ConfidenceLevel = 'Medium';
        if (/high/i.test(rawConf)) confidence = 'High';
        else if (/low/i.test(rawConf)) confidence = 'Low';

        const tokenUsage: TokenUsage = {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          estimatedCost: 0, // Local open source model is 100% free!
        };

        return {
          analysis: {
            testName: failure.testName,
            category,
            confidence,
            explanation: rawExp,
            suggestedAction: rawAction,
            relevantLogExcerpt: rawExcerpt || failure.errorMessage.slice(0, 200),
          },
          tokenUsage,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`  [Ollama attempt ${attempt} warning]:`, lastError.message);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`Ollama analysis failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  return {
    analyzeFailure,
    model: `ollama/${model}`,
  };
}
