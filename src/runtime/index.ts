/**
 * Runtime Layer
 * Export all runtime components
 */

// Config Loader
export type { Config } from "./config";
export { ConfigLoader } from "./config";

// Config Validation
export type {
  ValidationError,
  ValidationWarning,
  ConfigValidationResult,
  ConfigSchema,
} from "./config-validation";
export {
  validateConfig,
  validateEnvironmentConfig,
  validateOrExit,
  getConfigSchema,
  mergeEnvironmentConfig,
  isProductionMode,
  isDevelopmentMode,
  getEnvironment,
} from "./config-validation";

// Lifecycle & Graceful Shutdown
export type {
  ShutdownHook,
  OperationTracker,
} from "./lifecycle";
export {
  installSignalHandlers,
  removeSignalHandlers,
  registerShutdownHook,
  unregisterShutdownHook,
  triggerShutdown,
  isShuttingDown,
  getOperationTracker,
  trackOperation,
  waitForOperations,
  registerBuiltInShutdownHooks,
} from "./lifecycle";

// Bootstrap
export type { BootstrapOptions, BootstrapResult } from "./bootstrap";
export {
  bootstrap,
  isBootstrapped,
  shutdownApplication,
} from "./bootstrap";

// Prompt Loader
export { PromptLoader } from "./prompt";

// Tool Schema Loader
export type { ToolDefinition, ToolSchema } from "../types/tools.js";
export { ToolSchemaLoader } from "./tool-schema";

// Session Persistence
export { SessionPersistence } from "./session-persistence";
export type { SessionMetadata } from "./session-persistence";

// Models Service
export { getModelsService } from "./models";
