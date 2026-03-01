/**
 * Application Bootstrap
 *
 * This module handles all startup procedures:
 * - Signal handler installation
 * - Graceful shutdown hook registration
 */

import {
  installSignalHandlers,
  registerBuiltInShutdownHooks,
} from "./lifecycle.js";
import { ConfigLoader } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface BootstrapOptions {
  /**
   * Custom config path
   */
  configPath?: string;
  /**
   * Skip validation (useful for testing)
   */
  skipValidation?: boolean;
}

export interface BootstrapResult {
  /**
   * Whether initialization was successful
   */
  success: boolean;
  /**
   * Config loader instance
   */
  configLoader: ConfigLoader;
  /**
   * Any errors that occurred during initialization
   */
  errors: string[];
  /**
   * Any warnings that occurred during initialization
   */
  warnings: string[];
}

// ============================================================================
// State
// ============================================================================

let isInitialized = false;
let isShuttingDownInProgress = false;

// ============================================================================
// Bootstrap
// ============================================================================

/**
 * Initialize the application
 * This should be called once at application startup
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  if (isInitialized) {
    return {
      success: true,
      configLoader: new ConfigLoader(options.configPath),
      errors: [],
      warnings: ["Bootstrap already initialized"],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Validate configuration
  let configLoader: ConfigLoader | null = null;
  try {
    configLoader = new ConfigLoader(options.configPath);
    await configLoader.loadConfig({
      validate: !options.skipValidation,
      exitOnError: false, // We'll handle errors ourselves
    });

    const validationResult = configLoader.validateConfig();
    if (!validationResult.valid) {
      errors.push(
        ...validationResult.errors.map((e) => `${e.path}: ${e.message}`)
      );
    }
    if (validationResult.warnings.length > 0) {
      warnings.push(
        ...validationResult.warnings.map((w) => `${w.path}: ${w.message}`)
      );
    }
  } catch (error) {
    const errorMsg = `Failed to load configuration: ${(error as Error).message}`;
    errors.push(errorMsg);
  }

  // Step 2: Install signal handlers
  try {
    installSignalHandlers();
  } catch (error) {
    const errorMsg = `Failed to install signal handlers: ${(error as Error).message}`;
    errors.push(errorMsg);
  }

  // Step 3: Register built-in shutdown hooks
  try {
    registerBuiltInShutdownHooks();
  } catch (error) {
    const errorMsg = `Failed to register shutdown hooks: ${(error as Error).message}`;
    errors.push(errorMsg);
  }

  isInitialized = true;

  return {
    success: errors.length === 0,
    configLoader: configLoader!,
    errors,
    warnings,
  };
}

/**
 * Check if bootstrap has been called
 */
export function isBootstrapped(): boolean {
  return isInitialized;
}

/**
 * Gracefully shutdown the application
 * Call this when you want to explicitly trigger shutdown
 */
export async function shutdownApplication(
  signal: "SIGTERM" | "SIGINT" = "SIGTERM"
): Promise<void> {
  if (isShuttingDownInProgress) {
    return;
  }

  isShuttingDownInProgress = true;

  const { triggerShutdown } = await import("./lifecycle.js");
  await triggerShutdown(signal);

  isInitialized = false;
}

// ============================================================================
// Auto-bootstrap on import (optional)
// ============================================================================

/**
 * Auto-bootstrap if environment variable is set
 * This allows the app to bootstrap automatically on module import
 */
if (process.env.CODIN_AUTO_BOOTSTRAP === "true" && !isInitialized) {
  // Defer to next tick to avoid import-time side effects
  Promise.resolve().then(() => bootstrap());
}
