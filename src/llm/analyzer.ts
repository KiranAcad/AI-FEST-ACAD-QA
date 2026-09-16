/**
 * LLM Analyzer — Single-failure analysis engine
 *
 * Wraps the Anthropic Claude API behind a clean interface.
 * Uses Tool Use (function calling) to guarantee structured JSON output
 * that matches the FailureAnalysis schema exactly.
 */

import Anthropic from '@anthropic-ai/sdk';
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

// ─── Zod Schema for structured output ───────────────────────────────────────

const FailureAnalysisSchema = z.object({
  category: z.enum(ROOT_CAUSE_CATEGORIES as [RootCauseCategory, ...RootCauseCategory[]]),
  confidence: z.enum(['High', 'Medium', 'Low'] as [ConfidenceLevel, ...ConfidenceLevel[]]),
  explanation: z
    .string()
    .describe('Clear explanation of why this category was chosen, referencing specific evidence from the error/logs'),
  suggested_action: z
    .string()
    .describe('Specific, actionable next step for the QA engineer to resolve or investigate this failure'),
  relevant_log_excerpt: z
    .string()
    .describe('The most relevant 1-3 lines from the error message or logs that support the classification'),
});

// Convert Zod schema to JSON Schema for the Anthropic Tool definition
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    required.push(key);
    const zodType = value as z.ZodTypeAny;

    if (zodType instanceof z.ZodEnum) {
      properties[key] = {
        type: 'string',
        enum: zodType.options,
        description: zodType.description,
      };
    } else if (zodType instanceof z.ZodString) {
      properties[key] = {
        type: 'string',
        description: zodType.description,
      };
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

// ─── Pricing (per million tokens, approximate) ──────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250414': { input: 0.80, output: 4.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

import { createOllamaAnalyzer } from './ollama-analyzer.js';

// ─── Analyzer ───────────────────────────────────────────────────────────────

export interface AnalyzerConfig {
  apiKey?: string;
  model?: string;
  provider?: 'anthropic' | 'ollama';
  ollamaUrl?: string;
  maxTokens?: number;
  maxRetries?: number;
}

/**
 * Create an LLM analyzer instance.
 * Supports both cloud models (Anthropic Claude) and local open-source models (Ollama).
 */
export function createAnalyzer(config: AnalyzerConfig) {
  if (config.provider === 'ollama') {
    return createOllamaAnalyzer({
      baseUrl: config.ollamaUrl,
      model: config.model || process.env.OLLAMA_MODEL || 'qwen3:1.7b',
      maxRetries: config.maxRetries,
    });
  }

  const client = new Anthropic({ apiKey: config.apiKey || '' });
  const model = config.model || 'claude-sonnet-4-20250514';
  const maxTokens = config.maxTokens || 1024;
  const maxRetries = config.maxRetries || 3;

  // Tool definition for structured output
  const analyzeFailureTool: Anthropic.Tool = {
    name: 'classify_test_failure',
    description:
      'Classify a failed test into a root cause category with explanation and suggested action. ' +
      'You MUST call this tool with your analysis.',
    input_schema: zodToJsonSchema(FailureAnalysisSchema) as Anthropic.Tool['input_schema'],
  };

  /**
   * Analyze a single test failure.
   *
   * @returns The structured analysis result and token usage
   */
  async function analyzeFailure(
    failure: ParsedFailure
  ): Promise<{ analysis: FailureAnalysis; tokenUsage: TokenUsage }> {
    const userPrompt = buildFailurePrompt(failure);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Analyze this failed Playwright test and classify its root cause. You MUST use the classify_test_failure tool to return your analysis.\n\n${userPrompt}`,
            },
          ],
          tools: [analyzeFailureTool],
          tool_choice: { type: 'tool' as const, name: 'classify_test_failure' },
        });

        // Extract the tool use response
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ContentBlock & { type: 'tool_use' } =>
            block.type === 'tool_use'
        );

        if (!toolUseBlock) {
          throw new Error('LLM did not return a tool_use block — unexpected response format');
        }

        // Validate the response against our schema
        const parsed = FailureAnalysisSchema.parse(toolUseBlock.input);

        const tokenUsage: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          estimatedCost: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
        };

        return {
          analysis: {
            testName: failure.testName,
            category: parsed.category,
            confidence: parsed.confidence,
            explanation: parsed.explanation,
            suggestedAction: parsed.suggested_action,
            relevantLogExcerpt: parsed.relevant_log_excerpt,
          },
          tokenUsage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry on rate limit (429) or server errors (5xx)
        if (error instanceof Anthropic.APIError && (error.status === 429 || error.status >= 500)) {
          const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.warn(
            `  ⚠ API error (${error.status}), retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        // Non-retryable error — throw immediately
        throw lastError;
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  return {
    analyzeFailure,
    model,
  };
}
