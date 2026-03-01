/**
 * Working Context
 * In-memory store for current conversation context
 * Implements sliding window with priority-based eviction
 */

import type {
  WorkingContextEntry,
  ContextSnapshot,
} from "./types.js";

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Rough token estimation (1 token ≈ 4 characters for English text)
 * This is a simple approximation - for production, use a proper tokenizer
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Approximate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a context entry
 */
export function estimateEntryTokens(entry: WorkingContextEntry): number {
  const contentTokens = estimateTokens(entry.content);
  const metadataTokens = entry.metadata
    ? estimateTokens(JSON.stringify(entry.metadata))
    : 0;
  return contentTokens + metadataTokens + 10; // +10 for entry overhead
}

// ============================================================================
// Eviction Strategies
// ============================================================================

export type EvictionStrategy = "fifo" | "lru" | "priority" | "balanced";

export interface EvictionConfig {
  strategy: EvictionStrategy;
  protectedTypes: WorkingContextEntry["type"][];
  minSystemEntries: number;
}

// ============================================================================
// Working Context Store
// ============================================================================

export class WorkingContext {
  private entries: Map<string, WorkingContextEntry> = new Map();
  private maxTokens: number;
  private evictionConfig: EvictionConfig;
  private totalTokens: number = 0;
  protectedEntries: Set<string> = new Set();

  constructor(maxTokens: number = 50000, evictionConfig?: Partial<EvictionConfig>) {
    this.maxTokens = maxTokens;
    this.evictionConfig = {
      strategy: "balanced",
      protectedTypes: ["system"],
      minSystemEntries: 3,
      ...evictionConfig,
    };
  }

  /**
   * Add an entry to the working context
   */
  add(entry: WorkingContextEntry): string {
    const id = entry.id || this.generateId();
    const entryWithId = { ...entry, id };
    const tokens = estimateEntryTokens(entryWithId);

    // Check if we need to evict
    this.ensureCapacity(tokens);

    // Add entry
    this.entries.set(id, entryWithId);
    this.totalTokens += tokens;

    return id;
  }

  /**
   * Get an entry by ID
   */
  get(id: string): WorkingContextEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Update an entry
   */
  update(id: string, updates: Partial<WorkingContextEntry>): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Remove old token count
    this.totalTokens -= estimateEntryTokens(entry);

    // Update entry
    const updated = { ...entry, ...updates };
    this.entries.set(id, updated);

    // Add new token count
    this.totalTokens += estimateEntryTokens(updated);

    return true;
  }

  /**
   * Remove an entry
   */
  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.totalTokens -= estimateEntryTokens(entry);
    this.entries.delete(id);
    this.protectedEntries.delete(id);

    return true;
  }

  /**
   * Mark an entry as protected (won't be evicted)
   */
  protect(id: string): void {
    if (this.entries.has(id)) {
      this.protectedEntries.add(id);
    }
  }

  /**
   * Unprotect an entry
   */
  unprotect(id: string): void {
    this.protectedEntries.delete(id);
  }

  /**
   * Get all entries
   */
  getAll(): WorkingContextEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get entries by type
   */
  getByType(type: WorkingContextEntry["type"]): WorkingContextEntry[] {
    return this.getAll().filter((e) => e.type === type);
  }

  /**
   * Get recent entries (by timestamp)
   */
  getRecent(count: number): WorkingContextEntry[] {
    return this.getAll()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    return this.totalTokens;
  }

  /**
   * Check if at capacity
   */
  isAtCapacity(): boolean {
    return this.totalTokens >= this.maxTokens;
  }

  /**
   * Get remaining token capacity
   */
  getRemainingCapacity(): number {
    return Math.max(0, this.maxTokens - this.totalTokens);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.protectedEntries.clear();
    this.totalTokens = 0;
  }

  /**
   * Create a snapshot of current state
   */
  snapshot(): ContextSnapshot {
    return {
      entries: this.getAll(),
      totalTokens: this.totalTokens,
      timestamp: Date.now(),
    };
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot: ContextSnapshot): void {
    this.clear();
    for (const entry of snapshot.entries) {
      this.entries.set(entry.id, entry);
      this.totalTokens += estimateEntryTokens(entry);
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalEntries: number;
    totalTokens: number;
    byType: Record<string, number>;
    oldestEntry: number;
    newestEntry: number;
    utilizationPercent: number;
  } {
    const entries = this.getAll();
    const byType: Record<string, number> = {};

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    const timestamps = entries.map((e) => e.timestamp);

    return {
      totalEntries: entries.length,
      totalTokens: this.totalTokens,
      byType,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      utilizationPercent: Math.round((this.totalTokens / this.maxTokens) * 100),
    };
  }

  /**
   * Format as messages for LLM (in role order)
   */
  formatForLLM(): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Sort by timestamp
    const sorted = this.getAll().sort((a, b) => a.timestamp - b.timestamp);

    for (const entry of sorted) {
      if (entry.type === "message" && entry.metadata?.role) {
        messages.push({
          role: entry.metadata.role as string,
          content: entry.content,
        });
      } else if (entry.type === "tool_call") {
        messages.push({
          role: "assistant",
          content: `[Calling tool: ${entry.metadata?.toolName}]`,
        });
      } else if (entry.type === "tool_result") {
        messages.push({
          role: "tool",
          content: `[Tool result: ${entry.metadata?.toolName}] ${entry.content}`,
        });
      }
    }

    return messages;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Ensure we have capacity for new tokens, evict if necessary
   */
  private ensureCapacity(requiredTokens: number): void {
    const available = this.getRemainingCapacity();

    if (available >= requiredTokens) {
      return; // Have enough space
    }

    const needsToFree = requiredTokens - available;
    this.evict(needsToFree);
  }

  /**
   * Evict entries based on strategy
   */
  private evict(tokensNeeded: number): number {
    let freed = 0;
    const candidates = this.getEvictionCandidates();

    for (const entry of candidates) {
      if (freed >= tokensNeeded) break;

      const entryTokens = estimateEntryTokens(entry);
      this.remove(entry.id);
      freed += entryTokens;
    }

    return freed;
  }

  /**
   * Get candidates for eviction based on strategy
   */
  private getEvictionCandidates(): WorkingContextEntry[] {
    let candidates = Array.from(this.entries.values())
      .filter((e) => !this.protectedEntries.has(e.id))
      .filter((e) => !this.evictionConfig.protectedTypes.includes(e.type));

    // Count protected system entries
    const systemCount = this.getAll().filter(
      (e) => e.type === "system" && this.protectedEntries.has(e.id)
    ).length;

    // If below minimum system entries, don't evict more system messages
    if (systemCount < this.evictionConfig.minSystemEntries) {
      candidates = candidates.filter((e) => e.type !== "system");
    }

    switch (this.evictionConfig.strategy) {
      case "fifo":
        // Oldest first
        return candidates.sort((a, b) => a.timestamp - b.timestamp);

      case "lru":
        // Least recently used (accessed would be tracked separately)
        // For now, use oldest
        return candidates.sort((a, b) => a.timestamp - b.timestamp);

      case "priority":
        // Lowest priority first (metadata.priority defaults to 0)
        return candidates.sort(
          (a, b) => (a.metadata?.priority || 0) - (b.metadata?.priority || 0)
        );

      case "balanced":
        // Mix of recency and priority
        return candidates.sort((a, b) => {
          const priorityScore = (a.metadata?.priority || 0) - (b.metadata?.priority || 0);
          const ageScore = (a.timestamp - b.timestamp) / 1000; // Age in seconds
          return priorityScore + ageScore * 0.1; // Weight recency less
        });

      default:
        return candidates;
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Preset Context Configurations
// ============================================================================

export const CONTEXT_PRESETS: Record<
  "compact" | "balanced" | "extensive",
  { maxTokens: number; evictionConfig: EvictionConfig }
> = {
  // Small context for low-credit scenarios
  compact: {
    maxTokens: 10000,
    evictionConfig: {
      strategy: "priority" as EvictionStrategy,
      protectedTypes: ["system"] as WorkingContextEntry["type"][],
      minSystemEntries: 2,
    },
  },
  // Balanced context (default)
  balanced: {
    maxTokens: 50000,
    evictionConfig: {
      strategy: "balanced" as EvictionStrategy,
      protectedTypes: ["system"] as WorkingContextEntry["type"][],
      minSystemEntries: 3,
    },
  },
  // Large context for complex tasks
  extensive: {
    maxTokens: 150000,
    evictionConfig: {
      strategy: "fifo" as EvictionStrategy,
      protectedTypes: ["system"] as WorkingContextEntry["type"][],
      minSystemEntries: 3,
    },
  },
};
