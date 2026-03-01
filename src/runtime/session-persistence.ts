/**
 * Session Persistence
 * Ported from src/codin/runtime/session_persistence.py
 */

import {
  writeFile,
  readFile,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

import type { SessionState } from "../types/agent.js";

/**
 * Session metadata interface
 */
export interface SessionMetadata {
  session_id: string;
  name?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  path: string;
}

/**
 * Session index interface
 */
interface SessionIndex {
  sessions: Record<string, SessionMetadata>;
}

/**
 * Default storage directory
 */
const DEFAULT_STORAGE_DIR = join(homedir(), ".codin", "sessions");
const INDEX_FILE = "sessions_index.json";

/**
 * Session Persistence class
 * Handles session save/load operations
 */
export class SessionPersistence {
  private storageDir: string;
  private indexPath: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    this.indexPath = join(this.storageDir, INDEX_FILE);
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await mkdir(this.storageDir, { recursive: true });
    } catch {
      // Directory already exists or error
    }
  }

  /**
   * Read or create session index
   */
  private async readOrCreateIndex(): Promise<SessionIndex> {
    await this.ensureStorageDir();

    try {
      const content = await readFile(this.indexPath, "utf-8");
      return JSON.parse(content) as SessionIndex;
    } catch {
      return { sessions: {} };
    }
  }

  /**
   * Write session index
   */
  private async writeIndex(index: SessionIndex): Promise<void> {
    await this.ensureStorageDir();
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  /**
   * Generate a session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Serialize session state to JSON
   */
  private _serializeState(state: SessionState): Record<string, unknown> {
    return {
      messages: state.messages,
      todos: state.todos,
      working_directory: state.working_directory,
      permission_rules: state.permission_rules,
      tool_execution_log: state.tool_execution_log,
      ui_state: state.ui_state,
      token_usage: state.token_usage,
      performance_metrics: state.performance_metrics,
      dry_run_mode: state.dry_run_mode,
      mode: state.mode,
    };
  }

  /**
   * Deserialize JSON to session state
   */
  private _deserializeState(data: Record<string, unknown>): SessionState {
    return {
      messages: (data.messages as SessionState["messages"]) || [],
      todos: (data.todos as SessionState["todos"]) || [],
      working_directory: (data.working_directory as string) || "",
      permission_rules: (data.permission_rules as SessionState["permission_rules"]) || [],
      tool_execution_log: (data.tool_execution_log as SessionState["tool_execution_log"]) || [],
      ui_state: (data.ui_state as SessionState["ui_state"]) || {},
      token_usage: (data.token_usage as SessionState["token_usage"]) || {},
      performance_metrics: (data.performance_metrics as SessionState["performance_metrics"]) || {},
      dry_run_mode: (data.dry_run_mode as SessionState["dry_run_mode"]) || false,
      mode: (data.mode as SessionState["mode"]) || "default",
    };
  }

  /**
   * Save current session to disk
   */
  async saveSession(
    state: SessionState,
    sessionId?: string,
    name?: string,
    description?: string
  ): Promise<string> {
    await this.ensureStorageDir();

    const id = sessionId || this.generateSessionId();
    const sessionPath = join(this.storageDir, `${id}.json`);

    // Serialize state
    const sessionData = {
      session_id: id,
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      state: this._serializeState(state),
    };

    // Write session file
    await writeFile(sessionPath, JSON.stringify(sessionData, null, 2), "utf-8");

    // Update index
    const index = await this.readOrCreateIndex();
    index.sessions[id] = {
      session_id: id,
      name,
      description,
      created_at: sessionData.created_at,
      updated_at: sessionData.updated_at,
      path: sessionPath,
    };
    await this.writeIndex(index);

    return id;
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<SessionState | null> {
    await this.ensureStorageDir();

    const sessionPath = join(this.storageDir, `${sessionId}.json`);

    try {
      const content = await readFile(sessionPath, "utf-8");
      const data = JSON.parse(content) as { state: Record<string, unknown> };

      return this._deserializeState(data.state);
    } catch {
      return null;
    }
  }

  /**
   * List all saved sessions
   */
  async listSessions(): Promise<SessionMetadata[]> {
    await this.ensureStorageDir();

    const index = await this.readOrCreateIndex();
    return Object.values(index.sessions);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    await this.ensureStorageDir();

    const sessionPath = join(this.storageDir, `${sessionId}.json`);

    try {
      await rm(sessionPath);

      // Update index
      const index = await this.readOrCreateIndex();
      delete index.sessions[sessionId];
      await this.writeIndex(index);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session metadata
   */
  async getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const index = await this.readOrCreateIndex();
    return index.sessions[sessionId] || null;
  }

  /**
   * Export session to a file
   */
  async exportSession(
    sessionId: string,
    exportPath: string,
    format: "json" | "markdown" = "json"
  ): Promise<boolean> {
    const sessionPath = join(this.storageDir, `${sessionId}.json`);

    try {
      const content = await readFile(sessionPath, "utf-8");
      const data = JSON.parse(content);

      let outputContent: string;
      if (format === "json") {
        outputContent = JSON.stringify(data, null, 2);
      } else {
        // Markdown format
        const metadata = data as {
          name?: string;
          description?: string;
          created_at: string;
          updated_at: string;
          state: SessionState;
        };

        outputContent = `# ${metadata.name || sessionId}\n\n`;
        if (metadata.description) {
          outputContent += `${metadata.description}\n\n`;
        }
        outputContent += `**Created:** ${metadata.created_at}\n`;
        outputContent += `**Updated:** ${metadata.updated_at}\n\n`;

        outputContent += `## Messages\n\n`;
        for (const msg of metadata.state.messages) {
          outputContent += `### ${msg.role}\n`;
          outputContent += `${msg.content}\n\n`;
        }
      }

      await writeFile(exportPath, outputContent, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Import session from a file
   */
  async importSession(importPath: string): Promise<string | null> {
    try {
      const content = await readFile(importPath, "utf-8");
      const data = JSON.parse(content);

      const id = this.generateSessionId();
      const sessionPath = join(this.storageDir, `${id}.json`);

      await writeFile(sessionPath, JSON.stringify(data, null, 2), "utf-8");

      // Update index
      const index = await this.readOrCreateIndex();
      index.sessions[id] = {
        session_id: id,
        name: (data as { name?: string }).name,
        description: (data as { description?: string }).description,
        created_at: (data as { created_at?: string }).created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: sessionPath,
      };
      await this.writeIndex(index);

      return id;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(maxAge = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    // maxAge defaults to 30 days
    const index = await this.readOrCreateIndex();
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, metadata] of Object.entries(index.sessions)) {
      const updated = new Date(metadata.updated_at).getTime();
      if (now - updated > maxAge) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      await this.deleteSession(id);
    }

    return toDelete.length;
  }
}
