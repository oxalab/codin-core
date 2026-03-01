/**
 * Configuration Validation
 * Validates configuration at startup to fail fast on invalid config
 */

import { access, constants } from "node:fs/promises";
import { join, isAbsolute } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
  value?: unknown;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ConfigSchema {
  type: "string" | "number" | "boolean" | "object" | "array" | "enum";
  required?: boolean;
  allowedValues?: readonly unknown[];
  pattern?: RegExp;
  min?: number;
  max?: number;
  validate?: (value: unknown) => string | undefined;
  default?: unknown;
  description?: string;
  envVar?: string;
}

// ============================================================================
// Configuration Schema Definition
// ============================================================================

const CONFIG_SCHEMA: Record<string, ConfigSchema> = {
  // LLM Configuration
  "llm.provider": {
    type: "enum",
    required: false,
    allowedValues: ["anthropic", "openai", "openrouter"] as const,
    default: "anthropic",
    description: "LLM provider to use",
    envVar: "CODIN_LLM_PROVIDER",
  },
  "llm.model": {
    type: "string",
    required: false,
    default: "claude-sonnet-4-20250514",
    description: "LLM model to use",
    envVar: "CODIN_LLM_MODEL",
  },
  "llm.api_key": {
    type: "string",
    required: true,
    description: "API key for LLM provider",
    envVar: "ANTHROPIC_API_KEY",
  },
  "llm.temperature": {
    type: "number",
    required: false,
    min: 0,
    max: 2,
    default: 0.7,
    description: "LLM temperature setting",
  },
  "llm.max_tokens": {
    type: "number",
    required: false,
    min: 1,
    max: 100000,
    default: 8192,
    description: "Maximum tokens per LLM response",
  },

  // Working Directory
  "working_directory": {
    type: "string",
    required: false,
    default: ".",
    description: "Working directory for file operations",
    envVar: "CODIN_WORKING_DIR",
    validate: (value: unknown) => {
      if (typeof value === "string" && !isAbsolute(value)) {
        return "Must be an absolute path";
      }
      return undefined;
    },
  },

  // Logging
  "logging.level": {
    type: "enum",
    required: false,
    allowedValues: ["debug", "info", "warn", "error"] as const,
    default: "info",
    description: "Logging level",
    envVar: "CODIN_LOG_LEVEL",
  },
  "logging.enable_file": {
    type: "boolean",
    required: false,
    default: true,
    description: "Enable file logging",
    envVar: "CODIN_LOG_FILE",
  },
  "logging.log_dir": {
    type: "string",
    required: false,
    default: "./logs",
    description: "Directory for log files",
    envVar: "CODIN_LOG_DIR",
  },

  // Features
  "features.minimal_tools": {
    type: "boolean",
    required: false,
    default: false,
    description: "Use minimal tool set",
    envVar: "CODIN_MINIMAL_TOOLS",
  },
  "features.rebuild_mode": {
    type: "boolean",
    required: false,
    default: false,
    description: "Enable rebuild mode tools",
    envVar: "CODIN_REBUILD_MODE",
  },

  // Permissions
  "permissions.auto_allow_readonly": {
    type: "boolean",
    required: false,
    default: false,
    description: "Auto-allow read-only tools",
    envVar: "CODIN_AUTO_ALLOW_READONLY",
  },
  "permissions.session_only": {
    type: "boolean",
    required: false,
    default: true,
    description: "Only store permissions in session",
    envVar: "CODIN_SESSION_PERMISSIONS",
  },

  // Limits
  "limits.max_tokens": {
    type: "number",
    required: false,
    min: 100,
    max: 200000,
    default: 100000,
    description: "Maximum tokens per session",
    envVar: "CODIN_MAX_TOKENS",
  },
  "limits.max_session_time": {
    type: "number",
    required: false,
    min: 60,
    max: 86400,
    default: 3600,
    description: "Maximum session time in seconds",
    envVar: "CODIN_MAX_SESSION_TIME",
  },

  // Retry
  "retry.max_attempts": {
    type: "number",
    required: false,
    min: 1,
    max: 10,
    default: 3,
    description: "Maximum retry attempts for failed operations",
    envVar: "CODIN_RETRY_MAX_ATTEMPTS",
  },
  "retry.base_delay": {
    type: "number",
    required: false,
    min: 100,
    max: 60000,
    default: 1000,
    description: "Base retry delay in milliseconds",
    envVar: "CODIN_RETRY_BASE_DELAY",
  },
};

// ============================================================================
// Validator
// ============================================================================

/**
 * Validate a single value against a schema
 */
function validateValue(
  path: string,
  value: unknown,
  schema: ConfigSchema
): string | undefined {
  // Type check
  if (value === null || value === undefined) {
    if (schema.required) {
      return `Required field is missing`;
    }
    return undefined; // Optional field is fine if undefined
  }

  // Type validation
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        return `Expected string, got ${typeof value}`;
      }
      break;
    }
    case "number": {
      if (typeof value !== "number") {
        return `Expected number, got ${typeof value}`;
      }
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return `Expected boolean, got ${typeof value}`;
      }
      break;
    }
    case "enum": {
      if (schema.allowedValues && !schema.allowedValues.includes(value)) {
        return `Expected one of ${schema.allowedValues.join(", ")}, got ${value}`;
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) {
        return `Expected array, got ${typeof value}`;
      }
      break;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        return `Expected object, got ${typeof value}`;
      }
      break;
    }
  }

  // String-specific validations
  if (schema.type === "string" && typeof value === "string") {
    if (schema.pattern && !schema.pattern.test(value)) {
      return `Does not match required pattern`;
    }
    if (schema.min !== undefined && value.length < schema.min) {
      return `Must be at least ${schema.min} characters`;
    }
    if (schema.max !== undefined && value.length > schema.max) {
      return `Must be at most ${schema.max} characters`;
    }
  }

  // Number-specific validations
  if (schema.type === "number" && typeof value === "number") {
    if (schema.min !== undefined && value < schema.min) {
      return `Must be at least ${schema.min}`;
    }
    if (schema.max !== undefined && value > schema.max) {
      return `Must be at most ${schema.max}`;
    }
  }

  // Custom validation
  if (schema.validate) {
    const customError = schema.validate(value);
    if (customError) {
      return customError;
    }
  }

  return undefined;
}

/**
 * Validate configuration object against schema
 */
export function validateConfig(config: Record<string, unknown>): ConfigValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check each schema entry
  for (const [path, schema] of Object.entries(CONFIG_SCHEMA)) {
    const value = (config as Record<string, unknown>)[path];
    const error = validateValue(path, value, schema);

    if (error) {
      errors.push({
        path,
        message: error,
        value,
      });
    }
  }

  // Additional cross-field validations
  // Check if API key matches provider
  const provider = (config.llm as Record<string, unknown> | undefined)?.provider;
  const apiKey = (config.llm as Record<string, unknown> | undefined)?.api_key;

  if (provider === "anthropic" && apiKey && typeof apiKey === "string") {
    if (!apiKey.startsWith("sk-ant-")) {
      warnings.push({
        path: "llm.api_key",
        message: "Anthropic API key should start with 'sk-ant-'",
      });
    }
  } else if (provider === "openai" && apiKey && typeof apiKey === "string") {
    if (!apiKey.startsWith("sk-")) {
      warnings.push({
        path: "llm.api_key",
        message: "OpenAI API key should start with 'sk-'",
      });
    }
  } else if (provider === "openrouter" && apiKey && typeof apiKey === "string") {
    if (!apiKey.startsWith("sk-or-")) {
      warnings.push({
        path: "llm.api_key",
        message: "OpenRouter API key should start with 'sk-or-'",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment variable configuration
 */
export async function validateEnvironmentConfig(): Promise<ConfigValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check working directory
  const cwd = process.env.CODIN_WORKING_DIR || process.cwd();
  try {
    await access(cwd, constants.R_OK | constants.W_OK);
  } catch {
    errors.push({
      path: "CODIN_WORKING_DIR",
      message: "Working directory not accessible",
      value: cwd,
    });
  }

  // Check log directory
  const logDir = process.env.CODIN_LOG_DIR || "./logs";
  try {
    await access(logDir, constants.W_OK);
  } catch {
    // Directory may not exist, but that's okay - we'll create it
    warnings.push({
      path: "CODIN_LOG_DIR",
      message: "Log directory does not exist (will be created)",
      value: logDir,
    });
  }

  // Check for at least one LLM API key
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!hasAnthropic && !hasOpenAI && !hasOpenRouter) {
    errors.push({
      path: "LLM_API_KEY",
      message: "No LLM API key configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY)",
    });
  }

  // Validate API key formats
  if (hasAnthropic && !process.env.ANTHROPIC_API_KEY!.startsWith("sk-ant-")) {
    warnings.push({
      path: "ANTHROPIC_API_KEY",
      message: "API key format may be incorrect (expected 'sk-ant-')",
    });
  }

  if (hasOpenAI && !process.env.OPENAI_API_KEY!.startsWith("sk-")) {
    warnings.push({
      path: "OPENAI_API_KEY",
      message: "API key format may be incorrect (expected 'sk-')",
    });
  }

  if (hasOpenRouter && !process.env.OPENROUTER_API_KEY!.startsWith("sk-or-")) {
    warnings.push({
      path: "OPENROUTER_API_KEY",
      message: "API key format may be incorrect (expected 'sk-or-')",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get configuration schema (for documentation)
 */
export function getConfigSchema(): Record<string, ConfigSchema> {
  return { ...CONFIG_SCHEMA };
}

/**
 * Validate and report errors, exiting if invalid
 */
export function validateOrExit(config: Record<string, unknown>): void {
  const result = validateConfig(config);

  if (result.errors.length > 0) {
    console.error("❌ Configuration validation failed:");
    for (const error of result.errors) {
      console.error(`  - ${error.path}: ${error.message}`);
      if (error.value !== undefined) {
        console.error(`    Value: ${JSON.stringify(error.value)}`);
      }
    }
    console.error("\nPlease fix the configuration and try again.");
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.warn("⚠️  Configuration warnings:");
    for (const warning of result.warnings) {
      console.warn(`  - ${warning.path}: ${warning.message}`);
    }
  }

  console.log("✅ Configuration validation passed");
}

/**
 * Merge environment overrides with base config
 */
export function mergeEnvironmentConfig(
  baseConfig: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...baseConfig };

  // Helper to get env value
  const getEnv = (key: string, schema: ConfigSchema): unknown => {
    const envValue = process.env[key];
    if (envValue === undefined) return undefined;

    // Type conversion based on schema
    switch (schema.type) {
      case "boolean":
        return envValue === "true" || envValue === "1";
      case "number":
        return Number(envValue);
      case "enum":
        return envValue;
      default:
        return envValue;
    }
  };

  // Apply environment overrides
  for (const [path, schema] of Object.entries(CONFIG_SCHEMA)) {
    const envValue = schema.envVar ? getEnv(schema.envVar, schema) : undefined;
    if (envValue !== undefined) {
      const pathParts = path.split(".");
      let current = merged as Record<string, unknown>;

      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      current[pathParts[pathParts.length - 1]] = envValue;
    }
  }

  return merged;
}

/**
 * Check if running in production mode
 */
export function isProductionMode(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Check if running in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Get the current environment
 */
export function getEnvironment(): "development" | "production" | "test" {
  return (process.env.NODE_ENV as any) || "development";
}
