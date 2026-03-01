/**
 * Models Service
 * Fetches available models from LLM providers
 */

import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

export interface ParsedModel {
  id: string;
  name: string;
  provider: string;
  description: string;
}

/**
 * Popular free/cheap models with descriptions
 */
const POPULAR_MODELS: Record<string, ParsedModel> = {
  // Z.AI (GLM / Zhipu AI) models
  "glm-4-flash": {
    id: "glm-4-flash",
    name: "glm-4-flash",
    provider: "z.ai",
    description: "Fast, free tier",
  },
  "glm-4-plus": {
    id: "glm-4-plus",
    name: "glm-4-plus",
    provider: "z.ai",
    description: "Strong reasoning",
  },
  "glm-4.7": {
    id: "glm-4.7",
    name: "glm-4.7",
    provider: "z.ai",
    description: "Latest GLM model",
  },
  "glm-4": {
    id: "glm-4",
    name: "glm-4",
    provider: "z.ai",
    description: "GLM-4 standard",
  },
  "glm-4-alltools": {
    id: "glm-4-alltools",
    name: "glm-4-alltools",
    provider: "z.ai",
    description: "GLM with tools",
  },
  // OpenRouter free/cheap models
  "google/gemma-3-27b-it": {
    id: "google/gemma-3-27b-it",
    name: "gemma-3-27b",
    provider: "google",
    description: "Free tier available",
  },
  "meta-llama/llama-3.3-8b-instruct": {
    id: "meta-llama/llama-3.3-8b-instruct",
    name: "llama-3.3-8b",
    provider: "meta",
    description: "Free tier available",
  },
  "microsoft/phi-4-mini-instruct": {
    id: "microsoft/phi-4-mini-instruct",
    name: "phi-4-mini",
    provider: "microsoft",
    description: "Fast, free tier",
  },
  "qwen/qwen-2.5-72b-instruct": {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "qwen-2.5-72b",
    provider: "qwen",
    description: "Strong reasoning",
  },
  "qwen/qwen3-coder": {
    id: "qwen/qwen3-coder",
    name: "qwen3-coder",
    provider: "qwen",
    description: "Code focused",
  },
  "deepseek/deepseek-r1": {
    id: "deepseek/deepseek-r1",
    name: "deepseek-r1",
    provider: "deepseek",
    description: "Reasoning model",
  },
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    name: "gpt-4o-mini",
    provider: "openai",
    description: "Fast, cheap",
  },
  "openai/gpt-4o": {
    id: "openai/gpt-4o",
    name: "gpt-4o",
    provider: "openai",
    description: "Balanced",
  },
  "anthropic/claude-3.5-sonnet": {
    id: "anthropic/claude-3.5-sonnet",
    name: "claude-3.5-sonnet",
    provider: "anthropic",
    description: "Strong all-rounder",
  },
  "anthropic/claude-3-haiku": {
    id: "anthropic/claude-3-haiku",
    name: "claude-3-haiku",
    provider: "anthropic",
    description: "Fast, cheap",
  },
};

/**
 * Get models directory path
 */
function getModelsDir(): string {
  const moduleDir = import.meta.url ? dirname(fileURLToPath(import.meta.url)) : "";
  return resolve(moduleDir, "..", "..", "models");
}

/**
 * Load custom models from models.json file
 */
async function loadCustomModels(): Promise<Record<string, ParsedModel>> {
  const modelsPath = join(getModelsDir(), "models.json");

  try {
    const content = await readFile(modelsPath, "utf-8");
    const data = JSON.parse(content);

    // Convert to ParsedModel format
    const models: Record<string, ParsedModel> = {};
    for (const [id, info] of Object.entries(data)) {
      const modelInfo = info as any;
      models[id] = {
        id,
        name: modelInfo.name || id.split("/").pop() || id,
        provider: modelInfo.provider || "unknown",
        description: modelInfo.description || "",
      };
    }

    return models;
  } catch {
    // File doesn't exist - return empty
    return {};
  }
}

/**
 * Fetch available models from OpenRouter API
 */
async function fetchOpenRouterModels(apiKey: string): Promise<Record<string, ParsedModel>> {
  try {
    // Add timeout to avoid hanging when OpenRouter is down
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log("[Models] Failed to fetch from OpenRouter, using defaults");
      return POPULAR_MODELS;
    }

    const data = await response.json();
    const models: Record<string, ParsedModel> = {};

    for (const model of data.data || []) {
      const id = model.id as string;
      // Only include popular free/cheap models to avoid overwhelming the UI
      if (POPULAR_MODELS[id]) {
        models[id] = POPULAR_MODELS[id];
      }
    }

    return Object.keys(models).length > 0 ? models : POPULAR_MODELS;
  } catch (error) {
    console.log("[Models] Error fetching from OpenRouter, using defaults");
    return POPULAR_MODELS;
  }
}

/**
 * ModelsService class
 */
export class ModelsService {
  private cache: Map<string, ParsedModel[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

  /**
   * Get available models for a provider
   */
  async getModels(provider: string, apiKey?: string): Promise<ParsedModel[]> {
    const cacheKey = provider;

    // Check cache
    const cached = this.cache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    let models: ParsedModel[] = [];

    if (provider === "openrouter" && apiKey) {
      const fetched = await fetchOpenRouterModels(apiKey);
      models = Object.values(fetched);
    } else if (provider === "zai" || provider === "z.ai") {
      // Filter models for z.ai provider
      models = Object.values(POPULAR_MODELS).filter(m => m.provider === "z.ai");
    } else {
      // For other providers or no API key, use defaults
      models = Object.values(POPULAR_MODELS);
    }

    // Load custom models and merge
    const customModels = await loadCustomModels();
    for (const model of Object.values(customModels)) {
      if (!models.find((m) => m.id === model.id)) {
        models.push(model);
      }
    }

    // Cache the results
    this.cache.set(cacheKey, models);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

    return models;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Map display name to full model ID
   */
  async getModelId(displayName: string, provider: string, apiKey?: string): Promise<string> {
    const models = await this.getModels(provider, apiKey);
    const model = models.find((m) => m.name === displayName);
    return model?.id || displayName;
  }
}

// Singleton instance
let modelsServiceInstance: ModelsService | null = null;

export function getModelsService(): ModelsService {
  if (!modelsServiceInstance) {
    modelsServiceInstance = new ModelsService();
  }
  return modelsServiceInstance;
}

/**
 * Map display name to full model ID (convenience function)
 */
export async function getFullModelId(displayName: string, provider: string, apiKey?: string): Promise<string> {
  const service = getModelsService();
  return service.getModelId(displayName, provider, apiKey);
}
