/**
 * Memory System Types
 * Defines interfaces for all memory stores and operations
 */

// ============================================================================
// Common Types
// ============================================================================

export interface MemoryConfig {
  /**
   * Directory for memory database storage
   */
  dataDir?: string;
  /**
   * Maximum tokens in working context before eviction
   */
  maxWorkingTokens?: number;
  /**
   * Whether to enable memory persistence
   */
  enablePersistence?: boolean;
  /**
   * Paths to exclude from project index
   */
  excludePatterns?: string[];
  /**
   * How often to rescan project (ms)
   */
  rescanInterval?: number;
}

export interface MemoryStats {
  workingContext: {
    messages: number;
    estimatedTokens: number;
  };
  projectIndex: {
    filesIndexed: number;
    symbolsIndexed: number;
    lastScan: string;
  };
  conversationMemory: {
    sessionsStored: number;
    messagesStored: number;
  };
  semanticMemory: {
    factsStored: number;
    categories: Record<string, number>;
  };
}

// ============================================================================
// Working Context Types
// ============================================================================

export interface WorkingContextEntry {
  id: string;
  type: "message" | "tool_call" | "tool_result" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    role?: string;
    toolName?: string;
    tokens?: number;
    priority?: number; // Higher = less likely to evict
  };
}

export interface ContextSnapshot {
  entries: WorkingContextEntry[];
  totalTokens: number;
  timestamp: number;
}

// ============================================================================
// Project Index Types
// ============================================================================

export interface IndexedFile {
  path: string;
  hash: string;
  lastModified: number;
  size: number;
  language: string;
  importanceScore: number;
  content?: string; // Cached content (optional)
}

export interface SymbolInfo {
  id: string;
  filePath: string;
  symbolType: "class" | "interface" | "function" | "method" | "variable" | "type" | "enum" | "const";
  name: string;
  lineStart: number;
  lineEnd?: number;
  parent?: string; // Parent class/interface
  signature?: string;
  docComment?: string;
}

export interface ProjectScanResult {
  filesScanned: number;
  filesAdded: number;
  filesUpdated: number;
  filesRemoved: number;
  symbolsExtracted: number;
  durationMs: number;
}

export interface FileContext {
  file: IndexedFile;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
}

// ============================================================================
// Conversation Memory Types
// ============================================================================

export interface StoredSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  summary: string;
  tags: string[];
  messageCount: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolName?: string;
  toolResult?: string;
  tokens?: number;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  keyTopics: string[];
  decisionMade: string[];
  filesWorkedOn: string[];
}

// ============================================================================
// Semantic Memory Types (Key-Value, NOT vectors)
// ============================================================================

export type FactCategory = "preference" | "fact" | "pattern" | "decision" | "code_snippet" | "file_note" | "user_info";

export interface StoredFact {
  key: string;
  value: string;
  category: FactCategory;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessed: string;
  metadata?: {
    relatedFiles?: string[];
    confidence?: number;
    source?: "user" | "agent" | "system";
    expiresAt?: string;
  };
}

export interface FactQuery {
  query: string;
  category?: FactCategory;
  limit?: number;
  fuzzyMatch?: boolean;
}

// ============================================================================
// Retrieval Engine Types
// ============================================================================

export type RetrievalTrigger =
  | "stuck_loop" // Agent repeating same action
  | "hallucination" // Tool results contradict LLM
  | "explicit" // User asks for memory
  | "tool_call" // Agent calls recall()
  | "new_file" // Agent encounters unfamiliar file
  | "error_recovery"; // Trying to recover from error

export interface RetrievalRequest {
  trigger: RetrievalTrigger;
  context?: {
    currentMessage?: string;
    recentToolCalls?: string[];
    recentErrors?: string[];
    filePath?: string;
  };
}

export interface RetrievalResult {
  trigger: RetrievalTrigger;
  facts: StoredFact[];
  relevantFiles?: FileContext[];
  pastSessions?: StoredSession[];
  suggestions: string[];
}

export interface StuckLoopDetection {
  isStuck: boolean;
  pattern?: string;
  iterations: number;
}

export interface HallucinationDetection {
  isHallucinating: boolean;
  contradiction?: string;
  confidence: number;
}

// ============================================================================
// Memory Manager Types
// ============================================================================

export interface MemoryManagerConfig extends MemoryConfig {
  /**
   * Enable auto-retrieval when stuck
   */
  enableAutoRetrieval?: boolean;
  /**
   * Enable automatic summarization
   */
  enableSummarization?: boolean;
  /**
   * Callback for LLM calls (for summarization)
   */
  llmCallback?: (prompt: string) => Promise<string>;
}

export interface RecallOptions {
  category?: FactCategory;
  includeFiles?: boolean;
  includeSessions?: boolean;
  limit?: number;
}

export interface RecallResult {
  facts: StoredFact[];
  files?: FileContext[];
  sessions?: StoredSession[];
  summary: string;
}

// ============================================================================
// Tool Types (for agent memory operations)
// ============================================================================

export interface RememberToolInput {
  key: string;
  value: string;
  category?: FactCategory;
  metadata?: Record<string, unknown>;
}

export interface RecallToolInput {
  query: string;
  category?: FactCategory;
  limit?: number;
}

export interface ForgetToolInput {
  key: string;
}

export interface GetFileContextInput {
  path: string;
  includeSymbols?: boolean;
}

export interface FindSymbolInput {
  name: string;
  type?: string;
  filePath?: string;
}

export interface SummarizeSessionInput {
  sessionId?: string;
}
