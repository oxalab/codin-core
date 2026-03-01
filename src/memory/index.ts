/**
 * Memory Module
 * Exports all memory components and utilities
 */

// Types
export type {
  MemoryConfig,
  MemoryStats,
  WorkingContextEntry,
  ContextSnapshot,
  IndexedFile,
  SymbolInfo,
  ProjectScanResult,
  StoredSession,
  StoredMessage,
  SessionSummary,
  StoredFact,
  FactCategory,
  FactQuery,
  RetrievalTrigger,
  RetrievalRequest,
  RetrievalResult,
  StuckLoopDetection,
  HallucinationDetection,
  MemoryManagerConfig,
  RecallOptions,
  RecallResult,
  RememberToolInput,
  RecallToolInput,
  ForgetToolInput,
  GetFileContextInput,
  FindSymbolInput,
  SummarizeSessionInput,
} from "./types.js";

// Database
export { MemoryDatabase, generateId, safeJsonParse, safeJsonStringify } from "./db.js";

// Working Context
export {
  WorkingContext,
  estimateTokens,
  CONTEXT_PRESETS,
} from "./working-context.js";

export type { EvictionStrategy, EvictionConfig } from "./working-context.js";

// Semantic Memory
export {
  SemanticMemory,
  createFactKey,
  FACT_CATEGORIES,
} from "./semantic-memory.js";

// Project Index
export {
  ProjectIndex,
  detectLanguage,
  hashFile,
  quickHash,
  extractSymbols,
  extractImports,
  extractExports,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./project-index.js";

// Conversation Memory
export {
  ConversationMemory,
  generateSimpleSummary,
} from "./conversation-memory.js";

// Retrieval Engine
export {
  RetrievalEngine,
  StuckLoopDetector,
  HallucinationDetector,
} from "./retrieval-engine.js";

// Memory Manager
export {
  MemoryManager,
  createMemoryManager,
  getMemoryManager,
  resetMemoryManager,
} from "./manager.js";
