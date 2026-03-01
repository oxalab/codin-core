/**
 * Context Manager
 * Ported from src/codin/agent/context_manager.py
 */

import type { Message, ToolExecution } from "../types/agent.js";
import type { ToolDefinition } from "../types/tools.js";

/**
 * File cache entry
 */
interface FileCacheEntry {
  content: string;
  hash: string;
  timestamp: number;
  token_count?: number;
  last_accessed: number;
}

/**
 * Context Manager class
 * Manages context optimization for LLM calls
 */
export class ContextManager {
  private cache: Map<string, FileCacheEntry> = new Map();
  private maxCacheSize = 1000;

  /**
   * Simple token counting - estimate based on character count
   * Rough estimate: 1 token ≈ 4 characters
   */
  countMessagesTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokens(msg.content || "");
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += this.estimateTokens(JSON.stringify(tc));
        }
      }
    }
    return total;
  }

  /**
   * Estimate tokens from text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Update token usage tracking
   */
  updateTokenUsage(inputTokens: number, outputTokens: number): void {
    // This would update some tracking mechanism
    // For now, this is a no-op
  }

  /**
   * Optimize context by summarizing old messages
   * Returns optimized message list
   */
  optimizeContext(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[]
  ): Message[] {
    // Simple optimization: keep all messages for now
    // A full implementation would:
    // 1. Check token count
    // 2. Summarize old messages if over limit
    // 3. Cache file contents
    // 4. Return optimized list

    const maxTokens = 100000; // Conservative limit
    const currentTokens = this.countMessagesTokens(messages);

    if (currentTokens <= maxTokens) {
      return messages;
    }

    // Summarize old messages (keep last 50%)
    const keepCount = Math.floor(messages.length * 0.5);
    return messages.slice(-keepCount);
  }

  /**
   * Get cached file content
   */
  getCachedFile(path: string): FileCacheEntry | undefined {
    const entry = this.cache.get(path);
    if (entry) {
      entry.last_accessed = Date.now();
    }
    return entry;
  }

  /**
   * Cache file content
   */
  cacheFile(path: string, content: string): void {
    // Generate simple hash
    const hash = this._simpleHash(content);

    const entry: FileCacheEntry = {
      content,
      hash,
      timestamp: Date.now(),
      last_accessed: Date.now(),
      token_count: this.estimateTokens(content),
    };

    this.cache.set(path, entry);

    // Prune cache if too large
    if (this.cache.size > this.maxCacheSize) {
      this._pruneCache();
    }
  }

  /**
   * Simple hash function
   */
  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Prune cache to max size
   */
  private _pruneCache(): void {
    const entries = Array.from(this.cache.entries());
    // Sort by last accessed
    entries.sort((a, b) => a[1].last_accessed - b[1].last_accessed);

    // Remove oldest entries
    const toRemove = entries.length - this.maxCacheSize;
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
