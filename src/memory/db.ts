/**
 * Memory Database Utilities
 * Shared SQLite database operations for all memory stores
 */

import { mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import Database from "better-sqlite3";
import { cwd } from "node:process";

// ============================================================================
// Database Connection Manager
// ============================================================================

export class MemoryDatabase {
  private db: DatabaseType | null = null;
  private dbPath: string;

  constructor(dataDir: string = join(cwd(), ".codin", "memory")) {
    this.dbPath = join(dataDir, "memory.db");
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    await ensureDir(dirname(this.dbPath));

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -64000"); // 64MB cache
    this.db.pragma("temp_store = MEMORY");

    await this.createTables();
  }

  /**
   * Create all database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Project index tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        size INTEGER NOT NULL,
        language TEXT NOT NULL,
        importance_score REAL DEFAULT 0.5,
        content TEXT,
        indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        name TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER,
        parent TEXT,
        signature TEXT,
        doc_comment TEXT,
        indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (file_path) REFERENCES indexed_files(path) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(symbol_type);

      CREATE TABLE IF NOT EXISTS file_imports (
        file_path TEXT NOT NULL,
        import_path TEXT NOT NULL,
        import_type TEXT NOT NULL,
        PRIMARY KEY (file_path, import_path),
        FOREIGN KEY (file_path) REFERENCES indexed_files(path) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_exports (
        file_path TEXT NOT NULL,
        export_name TEXT NOT NULL,
        export_type TEXT NOT NULL,
        PRIMARY KEY (file_path, export_name),
        FOREIGN KEY (file_path) REFERENCES indexed_files(path) ON DELETE CASCADE
      );
    `);

    // Conversation memory tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        summary TEXT,
        tags TEXT,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_name TEXT,
        tool_result TEXT,
        tokens INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);

    // Semantic memory tables (key-value, NOT vectors)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
      CREATE INDEX IF NOT EXISTS idx_facts_created ON facts(created_at);
      CREATE INDEX IF NOT EXISTS idx_facts_accessed ON facts(access_count DESC);
    `);

    // Retrieval tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_log (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        context TEXT,
        results_count INTEGER,
        duration_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_retrieval_timestamp ON retrieval_log(timestamp);
    `);
  }

  /**
   * Get the raw database instance
   */
  getDb(): DatabaseType {
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: (db: Database.Database) => T): T {
    const db = this.getDb();
    return db.transaction(fn)(db);
  }

  /**
   * Backup database to a file
   */
  backup(backupPath: string): void {
    const db = this.getDb();
    const fs = require("node:fs");
    fs.mkdirSync(dirname(backupPath), { recursive: true });

    // Use SQLite backup API (synchronous)
    const backup = db.backup(backupPath) as any;
    backup.step(-1); // Copy all pages
    backup.close();
  }

  /**
   * Get database statistics
   */
  getStats(): {
    fileSize: number;
    pageCount: number;
    tables: Array<{ name: string; rows: number }>;
  } {
    const db = this.getDb();

    const getFileSize = () => {
      try {
        const stats = require("node:fs").statSync(this.dbPath);
        return stats.size;
      } catch {
        return 0;
      }
    };

    const tables = db
      .prepare(
        `
        SELECT name, (SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%' || name || '%') as row_count
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `
      )
      .all() as Array<{ name: string; row_count: number }>;

    const pageCount = db.prepare("PRAGMA page_count").get() as { page_count: number };

    return {
      fileSize: getFileSize(),
      pageCount: pageCount.page_count,
      tables: tables.map((t) => ({
        name: t.name,
        rows: (db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get() as { count: number }).count,
      })),
    };
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Sanitize string for SQL LIKE queries
 */
export function sanitizeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, "\\$&");
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ""): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T = unknown>(str: string | null): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify JSON safely
 */
export function safeJsonStringify(obj: unknown): string | null {
  if (obj === null || obj === undefined) return null;
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}
