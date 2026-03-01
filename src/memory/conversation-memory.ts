/**
 * Conversation Memory
 * Stores sessions and messages for long-term conversation history
 */

import type {
  StoredSession,
  StoredMessage,
  SessionSummary,
} from "./types.js";
import {
  MemoryDatabase,
  generateId,
  safeJsonParse,
  safeJsonStringify,
} from "./db.js";
import { estimateTokens } from "./working-context.js";

// ============================================================================
// Conversation Memory Store
// ============================================================================

export class ConversationMemory {
  private db: MemoryDatabase;

  constructor(db: MemoryDatabase) {
    this.db = db;
  }

  /**
   * Create a new session
   */
  createSession(initialData?: {
    summary?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): string {
    const db = this.db.getDb();
    const sessionId = generateId("session");
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO sessions (session_id, started_at, summary, tags, metadata)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      sessionId,
      now,
      initialData?.summary || "",
      safeJsonStringify(initialData?.tags) || "[]",
      safeJsonStringify(initialData?.metadata)
    );

    return sessionId;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): StoredSession | null {
    const db = this.db.getDb();
    const row = db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as StoredSession | undefined;

    if (!row) return null;

    return this.parseSession(row);
  }

  /**
   * Update a session
   */
  updateSession(
    sessionId: string,
    updates: {
      summary?: string;
      tags?: string[];
      endedAt?: string;
      metadata?: Record<string, unknown>;
    }
  ): boolean {
    const db = this.db.getDb();
    const existing = this.getSession(sessionId);

    if (!existing) return false;

    const parts: string[] = [];
    const params: unknown[] = [];

    if (updates.summary !== undefined) {
      parts.push("summary = ?");
      params.push(updates.summary);
    }
    if (updates.tags !== undefined) {
      parts.push("tags = ?");
      params.push(safeJsonStringify(updates.tags));
    }
    if (updates.endedAt !== undefined) {
      parts.push("ended_at = ?");
      params.push(updates.endedAt);
    }
    if (updates.metadata !== undefined) {
      parts.push("metadata = ?");
      params.push(safeJsonStringify(updates.metadata));
    }

    if (parts.length === 0) return false;

    params.push(sessionId);
    db.prepare(`UPDATE sessions SET ${parts.join(", ")} WHERE session_id = ?`).run(...params);

    return true;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): boolean {
    const now = new Date().toISOString();
    return this.updateSession(sessionId, { endedAt: now });
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const db = this.db.getDb();
    const result = db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);

    // Messages are deleted via CASCADE
    if (result.changes > 0) {
      return true;
    }
    return false;
  }

  /**
   * List all sessions
   */
  listSessions(options?: {
    limit?: number;
    offset?: number;
    includeEnded?: boolean;
    tags?: string[];
  }): StoredSession[] {
    const db = this.db.getDb();

    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: unknown[] = [];

    if (!options?.includeEnded) {
      sql += " AND ended_at IS NULL";
    }

    if (options?.tags && options.tags.length > 0) {
      // This is a simple implementation - for production, you'd want a proper tag index
      for (const tag of options.tags) {
        sql += " AND tags LIKE ?";
        params.push(`%"${tag}"%`);
      }
    }

    sql += " ORDER BY started_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(sql).all(...params) as StoredSession[];
    return rows.map((r) => this.parseSession(r));
  }

  /**
   * Search sessions by content
   */
  searchSessions(query: string, limit = 10): Array<{ session: StoredSession; relevance: number }> {
    const db = this.db.getDb();
    const pattern = `%${query}%`;

    // Search in summaries and messages
    const sql = `
      SELECT DISTINCT s.*,
        (SELECT COUNT(*) FROM messages WHERE session_id = s.session_id AND content LIKE ?) as msg_count
      FROM sessions s
      WHERE s.summary LIKE ? OR s.session_id IN (
        SELECT session_id FROM messages WHERE content LIKE ?
      )
      ORDER BY msg_count DESC, s.started_at DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(pattern, pattern, pattern, limit) as Array<
      StoredSession & { msg_count: number }
    >;

    return rows.map((r) => ({
      session: this.parseSession(r),
      relevance: r.msg_count,
    }));
  }

  /**
   * Add a message to a session
   */
  addMessage(
    sessionId: string,
    role: "user" | "assistant" | "system" | "tool",
    content: string,
    metadata?: {
      toolName?: string;
      toolResult?: string;
      tokens?: number;
    }
  ): string {
    const db = this.db.getDb();
    const messageId = generateId("msg");
    const now = new Date().toISOString();

    // Estimate tokens if not provided
    const tokens = metadata?.tokens || estimateTokens(content);

    db.prepare(
      `
      INSERT INTO messages (id, session_id, role, content, timestamp, tool_name, tool_result, tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(messageId, sessionId, role, content, now, metadata?.toolName || null, metadata?.toolResult || null, tokens);

    // Update session message count
    db.prepare("UPDATE sessions SET message_count = message_count + 1, total_tokens = total_tokens + ? WHERE session_id = ?").run(
      tokens,
      sessionId
    );

    return messageId;
  }

  /**
   * Get messages for a session
   */
  getMessages(sessionId: string, limit?: number): StoredMessage[] {
    const db = this.db.getDb();

    let sql = "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC";
    const params: unknown[] = [sessionId];

    if (limit) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const rows = db.prepare(sql).all(...params) as StoredMessage[];
    return rows;
  }

  /**
   * Get recent messages across all sessions
   */
  getRecentMessages(limit = 50): Array<{ message: StoredMessage; sessionId: string }> {
    const db = this.db.getDb();
    const rows = db
      .prepare("SELECT *, session_id as sid FROM messages ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as Array<StoredMessage & { sid: string }>;

    return rows.map((r) => ({
      message: r,
      sessionId: r.sid,
    }));
  }

  /**
   * Get conversation summary
   */
  getSummary(sessionId: string): SessionSummary | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const messages = this.getMessages(sessionId);

    // Extract key topics (simple keyword extraction)
    const keyTopics = this.extractTopics(messages);

    // Extract files worked on (from tool calls)
    const filesWorkedOn = this.extractFiles(messages);

    // Extract decisions made
    const decisionsMade = this.extractDecisions(messages);

    return {
      sessionId,
      summary: session.summary,
      keyTopics,
      decisionMade: decisionsMade,
      filesWorkedOn,
    };
  }

  /**
   * Merge two sessions (combine their messages)
   */
  mergeSessions(targetSessionId: string, sourceSessionId: string): boolean {
    const db = this.db.getDb();
    const source = this.getSession(sourceSessionId);
    const target = this.getSession(targetSessionId);

    if (!source || !target) return false;

    // Move messages from source to target
    db
      .prepare(
        `
        UPDATE messages
        SET session_id = ?
        WHERE session_id = ?
      `
      )
      .run(targetSessionId, sourceSessionId);

    // Update message counts
    const targetCount = (
      db.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?").get(targetSessionId) as { count: number }
    ).count;
    const targetTokens = (
      db.prepare("SELECT SUM(tokens) as total FROM messages WHERE session_id = ?").get(targetSessionId) as { total: number }
    ).total;

    db.prepare("UPDATE sessions SET message_count = ?, total_tokens = ? WHERE session_id = ?").run(
      targetCount,
      targetTokens || 0,
      targetSessionId
    );

    // Delete source session
    this.deleteSession(sourceSessionId);

    return true;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalTokens: number;
    averageMessagesPerSession: number;
  } {
    const db = this.db.getDb();

    const totalSessions = (db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number }).count;
    const activeSessions = (db.prepare("SELECT COUNT(*) as count FROM sessions WHERE ended_at IS NULL").get() as { count: number })
      .count;
    const totalMessages = (db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number }).count;
    const totalTokens = (
      db.prepare("SELECT SUM(tokens) as total FROM messages").get() as { total: number | null }
    ).total || 0;

    return {
      totalSessions,
      activeSessions,
      totalMessages,
      totalTokens,
      averageMessagesPerSession: totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0,
    };
  }

  /**
   * Export all sessions
   */
  export(): StoredSession[] {
    return this.listSessions({ limit: 1000000, includeEnded: true });
  }

  /**
   * Clean up old sessions
   */
  cleanupOlderThan(daysOld: number): number {
    const db = this.db.getDb();
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare("DELETE FROM sessions WHERE started_at < ? AND ended_at IS NOT NULL").run(cutoff);

    return result.changes;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Parse session from database row
   */
  private parseSession(row: StoredSession): StoredSession {
    // Database returns JSON strings, but types expect parsed values
    const rawRow = row as any;
    const tagsValue = (rawRow.tags as string | null | undefined) ?? "[]";
    const tags = safeJsonParse<string[]>(tagsValue);
    const metadataValue = (rawRow.metadata as string | null | undefined) ?? "null";
    const metadata = safeJsonParse<Record<string, unknown>>(metadataValue);

    return {
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      summary: row.summary,
      tags: (Array.isArray(tags) ? tags : []) || [],
      messageCount: row.messageCount,
      totalTokens: row.totalTokens,
      metadata: metadata || undefined,
    };
  }

  /**
   * Extract key topics from messages
   */
  private extractTopics(messages: StoredMessage[]): string[] {
    const topics: Set<string> = new Set();

    // Simple keyword extraction - look for repeated words
    const wordCounts = new Map<string, number>();
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "for", "on", "at", "by", "with", "from", "as", "and", "or", "but", "not", "this", "that", "it", "its", "i", "you", "we", "they", "what", "which", "who", "when", "where", "how", "why", "if", "then", "so", "because", "can", "will", "would", "should", "could", "may", "might", "shall", "must"]);

    for (const msg of messages) {
      const words = msg.content.toLowerCase().match(/\b\w{4,}\b/g) || [];
      for (const word of words) {
        if (!stopWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    // Get top 5 repeated words
    const sorted = Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [word, count] of sorted.slice(0, 5)) {
      if (count >= 2) {
        topics.add(word);
      }
    }

    return Array.from(topics);
  }

  /**
   * Extract file paths from tool calls
   */
  private extractFiles(messages: StoredMessage[]): string[] {
    const files = new Set<string>();

    for (const msg of messages) {
      if (msg.role === "tool" || msg.toolName) {
        // Extract file paths from content
        const filePaths = msg.content.match(/[\w\-\.]+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|cs|php|rb|swift|dart|lua|sql|sh|json|yaml|yml|xml|html|css|scss|less|md|txt)/gi);
        if (filePaths) {
          for (const path of filePaths) {
            files.add(path);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Extract decisions from conversation
   */
  private extractDecisions(messages: StoredMessage[]): string[] {
    const decisions: string[] = [];

    // Look for patterns like "decided to", "chose to", "going to use"
    const decisionPatterns = [
      /decided to (\w+(?: \w+)*)/gi,
      /chose (?:to )?(\w+(?: \w+)*)/gi,
      /going to (?:use|implement|add) (\w+(?: \w+)*)/gi,
      /will (?:use|implement|add) (\w+(?: \w+)*)/gi,
    ];

    const combinedMessages = messages.map((m) => m.content).join(" ");

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(combinedMessages)) !== null) {
        decisions.push(match[1]);
      }
    }

    return [...new Set(decisions)];
  }
}

// ============================================================================
// Session Utilities
// ============================================================================

/**
 * Generate a simple summary from messages
 */
export function generateSimpleSummary(messages: StoredMessage[]): string {
  if (messages.length === 0) return "";

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const toolCalls = messages.filter((m) => m.role === "tool");

  const topics = new Set<string>();
  const tools = new Set<string>();

  // Extract topics from first few user messages
  for (const msg of userMessages.slice(0, 3)) {
    const words = msg.content.split(/\s+/).slice(0, 5);
    topics.add(words.join(" "));
  }

  // Extract tools used
  for (const msg of toolCalls) {
    if (msg.toolName) {
      tools.add(msg.toolName);
    }
  }

  let summary = `Conversation with ${userMessages.length} user messages and ${assistantMessages.length} assistant responses.`;

  if (tools.size > 0) {
    summary += ` Tools used: ${Array.from(tools).join(", ")}.`;
  }

  if (topics.size > 0) {
    summary += ` Topics: ${Array.from(topics).slice(0, 3).join("; ")}.`;
  }

  return summary;
}
