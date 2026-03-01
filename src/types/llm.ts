/**
 * LLM Gateway Types
 * Ported from src/codin/agent/llm_gateway.py
 */

import type { ToolCall } from "./agent";

/**
 * LLM Provider enum - matches Python LLMProvider
 */
export enum LLMProvider {
  ANTHROPIC = "anthropic",
  OPENAI = "openai",
  OPENROUTER = "openrouter",
  ZAI = "zai", // GLM / zhipu AI
}

/**
 * LLM Config interface - matches Python LLMConfig dataclass
 */
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  api_key: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * LLM Response interface - matches Python LLMResponse dataclass
 */
export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  finish_reason: string | null;
}

/**
 * Re-export agent types for convenience
 */
export type { ToolCall } from "./agent";

/**
 * Default models per provider - matches Python defaults
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.ANTHROPIC]: "claude-3-5-sonnet-20241022",
  [LLMProvider.OPENAI]: "gpt-4",
  [LLMProvider.OPENROUTER]: "openai/gpt-4o",
  [LLMProvider.ZAI]: "glm-4-flash",
};

/**
 * Create LLM config with defaults applied
 */
export function createLLMConfig(config: Partial<LLMConfig> & { provider: LLMProvider; api_key: string }): LLMConfig {
  return {
    provider: config.provider,
    model: config.model || DEFAULT_MODELS[config.provider],
    api_key: config.api_key,
    base_url: config.base_url,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.max_tokens,
  };
}
