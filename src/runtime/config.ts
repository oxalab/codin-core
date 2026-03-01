/**
 * Config Loader
 * Ported from src/codin/runtime/config_loader.py
 */

import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { cwd, env } from "node:process";
import { fileURLToPath } from "node:url";

import type { LLMConfig } from "../types/llm.js";
import { LLMProvider } from "../types/llm.js";
import {
  validateConfig,
  mergeEnvironmentConfig,
  validateOrExit,
  type ConfigValidationResult,
} from "./config-validation.js";

/**
 * Config interface
 * Phase 1: Added index signature for validation compatibility
 */
export interface Config {
  llm?: {
    provider?: LLMProvider | string;
    api_key?: string;
    model?: string;
    base_url?: string;
    temperature?: number;
    max_tokens?: number;
  };
  working_directory?: string;
  minimal_tools?: boolean;
  [key: string]: unknown; // Index signature for validation compatibility
}

/**
 * Get URL of current module
 */
function getCurrentModuleDir(): string {
  const url = import.meta.url;
  if (!url) return process.cwd?.() || "";

  // Convert file:// URL to proper path
  const filePath = fileURLToPath(url);
  // Go up two levels: src/runtime/config.ts -> src/runtime -> src
  return dirname(dirname(filePath));
}

/**
 * Default config path
 */
function getDefaultConfigPath(): string {
  return join(getCurrentModuleDir(), "..", "configs", "default_setting.json");
}

/**
 * Environment variable names
 */
const ENV_VARS = {
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
  CODIN_LLM_MODEL: "CODIN_LLM_MODEL",
  CODIN_WORKING_DIR: "CODIN_WORKING_DIR",
} as const;

/**
 * ConfigLoader class
 */
export class ConfigLoader {
  configPath: string;
  private configCache: Config | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || getDefaultConfigPath();
  }

  /**
   * Load configuration from JSON file with environment overrides
   * Phase 1: Integrates validation and structured logging
   */
  async loadConfig(options?: { validate?: boolean; exitOnError?: boolean }): Promise<Config> {
    if (this.configCache) {
      return this.configCache;
    }

    let config: Config = {};

    // Load from JSON file if exists
    try {
      const content = await readFile(this.configPath, "utf-8");
      config = JSON.parse(content);
    } catch {
      // File doesn't exist or invalid JSON - use defaults
      config = {};
    }

    // Apply environment variable overrides using Phase 1 validation module
    config = mergeEnvironmentConfig(config) as Config;

    // Validate configuration if requested
    const shouldValidate = options?.validate ?? true;
    if (shouldValidate) {
      const validationResult = validateConfig(config);
      if (validationResult.errors.length > 0) {
        if (options?.exitOnError ?? true) {
          validateOrExit(config);
        }
      }
    }

    // Cache the config
    this.configCache = config;
    return config;
  }

  /**
   * Validate the current configuration
   * Phase 1: Explicit validation method
   */
  validateConfig(): ConfigValidationResult {
    if (!this.configCache) {
      return {
        valid: false,
        errors: [{ path: "config", message: "Config not loaded yet" }],
        warnings: [],
      };
    }
    return validateConfig(this.configCache);
  }

  /**
   * Get full LLM config as LLMConfig object
   * Note: Does not exit on error to allow TUI to handle missing config gracefully
   */
  async getLLMConfig(): Promise<LLMConfig> {
    // Don't exit on error - let the TUI handle missing configuration gracefully
    const config = await this.loadConfig({ exitOnError: false });
    const llmConfig = config.llm || {};

    // Normalize provider string to enum
    let providerStr = (llmConfig.provider || "anthropic").toLowerCase();
    let provider: LLMProvider;

    if (providerStr === "anthropic") {
      provider = LLMProvider.ANTHROPIC;
    } else if (providerStr === "openai") {
      provider = LLMProvider.OPENAI;
    } else if (providerStr === "openrouter") {
      provider = LLMProvider.OPENROUTER;
    } else if (providerStr === "z.ai" || providerStr === "zai" || providerStr === "glm") {
      provider = LLMProvider.ZAI;
    } else {
      // Default to anthropic
      provider = LLMProvider.ANTHROPIC;
    }

    const apiKey =
      llmConfig.api_key ||
      env[ENV_VARS.ANTHROPIC_API_KEY] ||
      env[ENV_VARS.OPENAI_API_KEY] ||
      env[ENV_VARS.OPENROUTER_API_KEY] ||
      "";

    // Don't throw - let the caller handle missing API key
    // Default models per provider
    const defaultModels: Record<LLMProvider, string> = {
      [LLMProvider.ANTHROPIC]: "claude-3-5-sonnet-20241022",
      [LLMProvider.OPENAI]: "gpt-4",
      [LLMProvider.OPENROUTER]: "openai/gpt-4o",
      [LLMProvider.ZAI]: "glm-4-flash",
    };

    return {
      provider,
      model: llmConfig.model || defaultModels[provider],
      api_key: apiKey,
      base_url: llmConfig.base_url,
      temperature: llmConfig.temperature ?? 0.7,
      max_tokens: llmConfig.max_tokens ?? 1000,
    };
  }

  /**
   * Get working directory from config
   */
  async getWorkingDirectory(): Promise<string> {
    const config = await this.loadConfig();
    return config.working_directory || cwd();
  }

  /**
   * Check if minimal tools mode is enabled
   */
  async useMinimalTools(): Promise<boolean> {
    const config = await this.loadConfig();
    return config.minimal_tools ?? false;
  }

  /**
   * Apply environment variable overrides to config
   */
  private applyEnvOverrides(config: Config): Config {
    // LLM Provider
    if (env[ENV_VARS.ANTHROPIC_API_KEY]) {
      config.llm = config.llm || {};
      config.llm.provider = LLMProvider.ANTHROPIC;
    }
    if (env[ENV_VARS.OPENAI_API_KEY]) {
      config.llm = config.llm || {};
      config.llm.provider = LLMProvider.OPENAI;
    }
    if (env[ENV_VARS.OPENROUTER_API_KEY]) {
      config.llm = config.llm || {};
      config.llm.provider = LLMProvider.OPENROUTER;
    }

    // Model overrides
    if (env[ENV_VARS.CODIN_LLM_MODEL]) {
      config.llm = config.llm || {};
      config.llm.model = env[ENV_VARS.CODIN_LLM_MODEL];
    }

    // Working directory
    if (env[ENV_VARS.CODIN_WORKING_DIR]) {
      config.working_directory = env[ENV_VARS.CODIN_WORKING_DIR];
    }

    return config;
  }
}
