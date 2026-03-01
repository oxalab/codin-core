/**
 * Memory Manager
 * Unified API for all memory operations
 * Orchestrates Working Context, Semantic Memory, Project Index, and Conversation Memory
 */

import { join } from "node:path";
import { cwd } from "node:process";

import type {
  MemoryManagerConfig,
  RecallOptions,
  RecallResult,
  WorkingContextEntry,
  StoredFact,
  FactCategory,
  FileContext,
  StoredSession,
  MemoryStats,
} from "./types.js";

import { MemoryDatabase } from "./db.js";
import { WorkingContext, estimateTokens, CONTEXT_PRESETS } from "./working-context.js";
import { SemanticMemory, createFactKey, FACT_CATEGORIES } from "./semantic-memory.js";
import { ProjectIndex, DEFAULT_EXCLUDE_PATTERNS } from "./project-index.js";
import { ConversationMemory, generateSimpleSummary } from "./conversation-memory.js";
import { RetrievalEngine, StuckLoopDetector, HallucinationDetector } from "./retrieval-engine.js";

// ============================================================================
// Memory Manager
// ============================================================================

export class MemoryManager {
  private db: MemoryDatabase;
  private workingContext: WorkingContext;
  private semanticMemory: SemanticMemory;
  private projectIndex: ProjectIndex;
  private conversationMemory: ConversationMemory;
  private retrievalEngine: RetrievalEngine;
  private stuckDetector: StuckLoopDetector;
  private hallucinationDetector: HallucinationDetector;
  private config: MemoryManagerConfig;

  private currentSessionId: string | null = null;
  private initialized = false;

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      dataDir: join(cwd(), ".codin", "memory"),
      maxWorkingTokens: 50000,
      enablePersistence: true,
      excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
      rescanInterval: 60000, // 1 minute
      enableAutoRetrieval: true,
      enableSummarization: true,
      ...config,
    };

    // Initialize database
    this.db = new MemoryDatabase(this.config.dataDir!);

    // Initialize stores
    this.workingContext = new WorkingContext(this.config.maxWorkingTokens, CONTEXT_PRESETS.balanced.evictionConfig);
    this.semanticMemory = new SemanticMemory(this.db);
    this.projectIndex = new ProjectIndex(this.db, cwd(), this.config.excludePatterns);
    this.conversationMemory = new ConversationMemory(this.db);
    this.retrievalEngine = new RetrievalEngine(
      this.semanticMemory,
      this.projectIndex,
      this.conversationMemory
    );
    this.stuckDetector = new StuckLoopDetector();
    this.hallucinationDetector = new HallucinationDetector();
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize database
    await this.db.initialize();

    // Create a new session for this conversation
    this.currentSessionId = this.conversationMemory.createSession({
      summary: "",
      tags: [],
      metadata: { startedAt: new Date().toISOString() },
    });

    // Scan project if enabled
    try {
      await this.projectIndex.scan({ onProgress: (current, total, file) => {
        // Progress callback
      }});
    } catch (error) {
      // Continue anyway
    }

    this.initialized = true;
  }

  /**
   * Shutdown the memory system
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // End current session
    if (this.currentSessionId) {
      this.conversationMemory.endSession(this.currentSessionId);
    }

    // Close database
    this.db.close();

    this.initialized = false;
  }

  // ========================================================================
  // Working Context Operations
  // ========================================================================

  /**
   * Add an entry to working context
   */
  addToContext(entry: WorkingContextEntry): string {
    return this.workingContext.add(entry);
  }

  /**
   * Get current working context
   */
  getContext(): WorkingContextEntry[] {
    return this.workingContext.getAll();
  }

  /**
   * Get context as formatted messages for LLM
   */
  getContextForLLM(): Array<{ role: string; content: string }> {
    return this.workingContext.formatForLLM();
  }

  /**
   * Get context summary
   */
  getContextSummary(): {
    totalEntries: number;
    totalTokens: number;
    utilizationPercent: number;
  } {
    return this.workingContext.getSummary();
  }

  /**
   * Clear working context
   */
  clearContext(): void {
    this.workingContext.clear();
  }

  // ========================================================================
  // Semantic Memory Operations (remember/recall/forget)
  // ========================================================================

  /**
   * Remember a fact
   */
  remember(
    key: string,
    value: string,
    category: FactCategory = "fact",
    metadata?: Record<string, unknown>
  ): StoredFact {
    return this.semanticMemory.remember(key, value, category, metadata);
  }

  /**
   * Recall facts
   */
  async recall(query: string, options?: RecallOptions): Promise<RecallResult> {
    return await this.retrievalEngine.recall(query, options);
  }

  /**
   * Get a specific fact by key
   */
  getFact(key: string): StoredFact | null {
    return this.semanticMemory.get(key);
  }

  /**
   * Forget a fact
   */
  forget(key: string): boolean {
    return this.semanticMemory.forget(key);
  }

  /**
   * Clear all facts in a category
   */
  clearCategory(category: FactCategory): number {
    return this.semanticMemory.clearCategory(category);
  }

  // ========================================================================
  // Project Index Operations
  // ========================================================================

  /**
   * Get file context
   */
  getFileContext(path: string): FileContext | null {
    const context = this.projectIndex.getFileContext(path);
    if (context) {
      // Bump importance
      this.projectIndex.updateImportance(path, 0.05);
    }
    return context;
  }

  /**
   * Find a symbol
   */
  findSymbol(name: string, type?: string): any[] {
    return this.projectIndex.findSymbol(name, type);
  }

  /**
   * Search symbols
   */
  searchSymbols(query: string, limit = 20): any[] {
    return this.projectIndex.searchSymbols(query, limit);
  }

  /**
   * Search files
   */
  searchFiles(query: string, limit = 20): any[] {
    return this.projectIndex.searchFiles(query, limit);
  }

  /**
   * Get files by language
   */
  getFilesByLanguage(language: string): any[] {
    return this.projectIndex.getFilesByLanguage(language);
  }

  /**
   * Rescan the project
   */
  async rescanProject(options?: {
    force?: boolean;
    maxFiles?: number;
  }): Promise<any> {
    return await this.projectIndex.scan(options);
  }

  // ========================================================================
  // Session/Conversation Operations
  // ========================================================================

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get current session
   */
  getSession(): StoredSession | null {
    return this.currentSessionId
      ? this.conversationMemory.getSession(this.currentSessionId)
      : null;
  }

  /**
   * Add a message to current session
   */
  addMessage(
    role: "user" | "assistant" | "system" | "tool",
    content: string,
    metadata?: {
      toolName?: string;
      toolResult?: string;
    }
  ): string | null {
    if (!this.currentSessionId) return null;
    return this.conversationMemory.addMessage(this.currentSessionId, role, content, metadata);
  }

  /**
   * Get session summary
   */
  getSessionSummary(): any | null {
    if (!this.currentSessionId) return null;
    return this.conversationMemory.getSummary(this.currentSessionId);
  }

  /**
   * List past sessions
   */
  listSessions(options?: { limit?: number; includeEnded?: boolean }): StoredSession[] {
    return this.conversationMemory.listSessions(options);
  }

  /**
   * Search past sessions
   */
  searchSessions(query: string, limit = 10): Array<{ session: StoredSession; relevance: number }> {
    return this.conversationMemory.searchSessions(query, limit);
  }

  // ========================================================================
  // Retrieval & Detection
  // ========================================================================

  /**
   * Record an action for stuck loop detection
   */
  recordAction(action: string): void {
    this.stuckDetector.record(action);
    this.retrievalEngine.recordAction(action);
  }

  /**
   * Check if agent is stuck
   */
  isStuck(): { isStuck: boolean; pattern?: string; iterations: number } {
    return this.stuckDetector.detect();
  }

  /**
   * Check for hallucination
   */
  checkHallucination(llmOutput: string, toolResults: Array<{ tool: string; result: string }>): {
    isHallucinating: boolean;
    contradiction?: string;
    confidence: number;
  } {
    return this.hallucinationDetector.check(llmOutput, toolResults);
  }

  /**
   * Trigger retrieval (manual or automatic)
   */
  async retrieve(trigger: any, context?: {
    currentMessage?: string;
    recentToolCalls?: string[];
    recentErrors?: string[];
    filePath?: string;
  }): Promise<any> {
    return await this.retrievalEngine.retrieve({ trigger, context });
  }

  // ========================================================================
  // Statistics & Maintenance
  // ========================================================================

  /**
   * Get comprehensive memory statistics
   */
  getStats(): MemoryStats {
    const contextSummary = this.workingContext.getSummary();
    const projectStats = this.projectIndex.getStats();
    const conversationStats = this.conversationMemory.getStats();
    const semanticStats = this.semanticMemory.getStats();

    return {
      workingContext: {
        messages: contextSummary.totalEntries,
        estimatedTokens: contextSummary.totalTokens,
      },
      projectIndex: {
        filesIndexed: projectStats.totalFiles,
        symbolsIndexed: projectStats.totalSymbols,
        lastScan: projectStats.lastScan,
      },
      conversationMemory: {
        sessionsStored: conversationStats.totalSessions,
        messagesStored: conversationStats.totalMessages,
      },
      semanticMemory: {
        factsStored: semanticStats.totalFacts,
        categories: semanticStats.byCategory,
      },
    };
  }

  /**
   * Clean up old data
   */
  cleanup(options?: {
    oldSessionsDays?: number;
    expiredFacts?: boolean;
  }): {
    sessionsRemoved: number;
    factsRemoved: number;
  } {
    let sessionsRemoved = 0;
    let factsRemoved = 0;

    if (options?.oldSessionsDays) {
      sessionsRemoved = this.conversationMemory.cleanupOlderThan(options.oldSessionsDays);
    }

    if (options?.expiredFacts) {
      factsRemoved = this.semanticMemory.cleanupExpired();
    }

    return { sessionsRemoved, factsRemoved };
  }

  /**
   * Export all memory data
   */
  exportMemory(): {
    workingContext: WorkingContextEntry[];
    semanticMemory: any[];
    conversationMemory: StoredSession[];
    projectIndexStats: any;
  } {
    return {
      workingContext: this.workingContext.getAll(),
      semanticMemory: this.semanticMemory.export(),
      conversationMemory: this.conversationMemory.export(),
      projectIndexStats: this.projectIndex.getStats(),
    };
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the underlying database instance (for advanced use)
   */
  getDatabase(): MemoryDatabase {
    return this.db;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a memory manager with default configuration
 */
export async function createMemoryManager(config?: MemoryManagerConfig): Promise<MemoryManager> {
  const manager = new MemoryManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Get the singleton memory manager instance
 */
let singletonInstance: MemoryManager | null = null;

export async function getMemoryManager(config?: MemoryManagerConfig): Promise<MemoryManager> {
  if (!singletonInstance) {
    singletonInstance = new MemoryManager(config);
    await singletonInstance.initialize();
  }
  return singletonInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetMemoryManager(): void {
  if (singletonInstance) {
    singletonInstance.shutdown();
    singletonInstance = null;
  }
}
