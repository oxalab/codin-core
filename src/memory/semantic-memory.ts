/**
 * Semantic Memory
 * Key-value based fact storage (NOT vector embeddings)
 * Cost-effective alternative to vector databases
 */

import type {
  StoredFact,
  FactCategory,
  FactQuery,
} from "./types.js";
import {
  MemoryDatabase,
  generateId,
  safeJsonParse,
  safeJsonStringify,
} from "./db.js";

// ============================================================================
// Semantic Memory Store
// ============================================================================

export class SemanticMemory {
  private db: MemoryDatabase;

  constructor(db: MemoryDatabase) {
    this.db = db;
  }

  /**
   * Store a fact in memory
   */
  remember(
    key: string,
    value: string,
    category: FactCategory = "fact",
    metadata?: Record<string, unknown>
  ): StoredFact {
    const now = new Date().toISOString();
    const db = this.db.getDb();

    // Check if fact already exists
    const existing = db
      .prepare("SELECT * FROM facts WHERE key = ?")
      .get(key) as StoredFact | undefined;

    if (existing) {
      // Update existing fact
      db.prepare(
        `
        UPDATE facts
        SET value = ?, category = ?, updated_at = ?, metadata = ?
        WHERE key = ?
      `
      ).run(value, category, now, safeJsonStringify(metadata), key);

      return this.get(key)!;
    }

    // Insert new fact
    db.prepare(
      `
      INSERT INTO facts (key, value, category, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(key, value, category, now, now, safeJsonStringify(metadata));

    return this.get(key)!;
  }

  /**
   * Retrieve a fact by key
   */
  get(key: string): StoredFact | null {
    const db = this.db.getDb();
    const row = db
      .prepare("SELECT * FROM facts WHERE key = ?")
      .get(key) as StoredFact | undefined;

    if (!row) return null;

    // Update access count
    db
      .prepare("UPDATE facts SET access_count = access_count + 1, last_accessed = ? WHERE key = ?")
      .run(new Date().toISOString(), key);

    return this.parseFact(row);
  }

  /**
   * Query facts by category or keyword search
   */
  query(query: FactQuery): StoredFact[] {
    const db = this.db.getDb();
    let sql = "SELECT * FROM facts WHERE 1=1";
    const params: unknown[] = [];

    if (query.category) {
      sql += " AND category = ?";
      params.push(query.category);
    }

    if (query.fuzzyMatch && query.query) {
      // Fuzzy match on key or value
      sql += " AND (key LIKE ? OR value LIKE ?)";
      const pattern = `%${query.query}%`;
      params.push(pattern, pattern);
    } else if (query.query) {
      // Exact key match (with wildcard support)
      sql += " AND key LIKE ?";
      params.push(query.query.replace("*", "%"));
    }

    sql += " ORDER BY access_count DESC";

    if (query.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }

    const rows = db.prepare(sql).all(...params) as StoredFact[];
    return rows.map((r) => this.parseFact(r));
  }

  /**
   * Search facts by keyword in value or key
   */
  search(keyword: string, category?: FactCategory, limit = 10): StoredFact[] {
    const db = this.db.getDb();
    const pattern = `%${keyword}%`;

    let sql = `
      SELECT * FROM facts
      WHERE (key LIKE ? OR value LIKE ?)
    `;
    const params: unknown[] = [pattern, pattern];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    sql += " ORDER BY access_count DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as StoredFact[];
    return rows.map((r) => this.parseFact(r));
  }

  /**
   * Delete a fact
   */
  forget(key: string): boolean {
    const db = this.db.getDb();
    const result = db.prepare("DELETE FROM facts WHERE key = ?").run(key);
    return result.changes > 0;
  }

  /**
   * Clear all facts in a category
   */
  clearCategory(category: FactCategory): number {
    const db = this.db.getDb();
    const result = db.prepare("DELETE FROM facts WHERE category = ?").run(category);
    return result.changes;
  }

  /**
   * Get all facts grouped by category
   */
  getByCategory(): Record<FactCategory, StoredFact[]> {
    const db = this.db.getDb();
    const rows = db.prepare("SELECT * FROM facts ORDER BY access_count DESC").all() as StoredFact[];

    const result: Record<string, StoredFact[]> = {};
    for (const row of rows) {
      const fact = this.parseFact(row);
      if (!result[fact.category]) {
        result[fact.category] = [];
      }
      result[fact.category].push(fact);
    }

    return result as Record<FactCategory, StoredFact[]>;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFacts: number;
    byCategory: Record<string, number>;
    mostAccessed: StoredFact[];
    recentlyCreated: StoredFact[];
  } {
    const db = this.db.getDb();

    const total = (db.prepare("SELECT COUNT(*) as count FROM facts").get() as { count: number }).count;

    const byCategoryRows = db
      .prepare("SELECT category, COUNT(*) as count FROM facts GROUP BY category")
      .all() as Array<{ category: string; count: number }>;
    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRows) {
      byCategory[row.category] = row.count;
    }

    const mostAccessed = db
      .prepare("SELECT * FROM facts ORDER BY access_count DESC LIMIT 5")
      .all() as StoredFact[];
    const recentlyCreated = db
      .prepare("SELECT * FROM facts ORDER BY created_at DESC LIMIT 5")
      .all() as StoredFact[];

    return {
      totalFacts: total,
      byCategory,
      mostAccessed: mostAccessed.map((r) => this.parseFact(r)),
      recentlyCreated: recentlyCreated.map((r) => this.parseFact(r)),
    };
  }

  /**
   * Export all facts
   */
  export(): StoredFact[] {
    const db = this.db.getDb();
    const rows = db.prepare("SELECT * FROM facts").all() as StoredFact[];
    return rows.map((r) => this.parseFact(r));
  }

  /**
   * Import facts (replace existing)
   */
  import(facts: StoredFact[]): number {
    const db = this.db.getDb();

    return db.transaction(() => {
      let imported = 0;
      for (const fact of facts) {
        try {
          db.prepare(
            `
            INSERT OR REPLACE INTO facts (key, value, category, created_at, updated_at, access_count, last_accessed, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            fact.key,
            fact.value,
            fact.category,
            fact.createdAt,
            fact.updatedAt,
            fact.accessCount,
            fact.lastAccessed,
            safeJsonStringify(fact.metadata)
          );
          imported++;
        } catch (error) {
          // Failed to import fact
        }
      }
      return imported;
    })();
  }

  /**
   * Clean up expired facts
   */
  cleanupExpired(): number {
    const db = this.db.getDb();
    const now = new Date().toISOString();

    const result = db
      .prepare("DELETE FROM facts WHERE json_extract(metadata, '$.expiresAt') < ?")
      .run(now);

    return result.changes;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Parse fact from database row
   */
  private parseFact(row: StoredFact): StoredFact {
    return {
      key: row.key,
      value: row.value,
      category: row.category,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      accessCount: row.accessCount,
      lastAccessed: row.lastAccessed || row.createdAt,
      metadata: safeJsonParse(row.metadata as string) || undefined,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a fact key from components
 */
export function createFactKey(...parts: string[]): string {
  return parts.join(":").toLowerCase().replace(/\s+/g, "_");
}

/**
 * Suggested categories for different types of information
 */
export const FACT_CATEGORIES = {
  // User preferences and settings
  PREFERENCE: "preference" as FactCategory,
  // General facts
  FACT: "fact" as FactCategory,
  // Code patterns the agent should remember
  PATTERN: "pattern" as FactCategory,
  // Decisions made during development
  DECISION: "decision" as FactCategory,
  // Code snippets to remember
  CODE_SNIPPET: "code_snippet" as FactCategory,
  // Notes about specific files
  FILE_NOTE: "file_note" as FactCategory,
  // Information about the user
  USER_INFO: "user_info" as FactCategory,
} as const;
