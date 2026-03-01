/**
 * Memory Tools
 * Agent-accessible tools for memory operations
 * These tools allow the agent to remember, recall, and work with memory
 */

import type {
  RememberToolInput,
  RecallToolInput,
  ForgetToolInput,
  GetFileContextInput,
  FindSymbolInput,
  SummarizeSessionInput,
} from "../memory/types.js";

import { getMemoryManager } from "../memory/manager.js";
import type { FactCategory } from "../memory/types.js";

// ============================================================================
// Tool: remember - Store a fact in memory
// ============================================================================

export async function remember(
  key: string,
  value: string,
  category: string = "fact",
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  fact?: {
    key: string;
    value: string;
    category: string;
  };
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    // Validate category
    const validCategories: FactCategory[] = ["preference", "fact", "pattern", "decision", "code_snippet", "file_note", "user_info"];
    const normalizedCategory = validCategories.includes(category as FactCategory)
      ? (category as FactCategory)
      : "fact";

    const fact = memory.remember(key, value, normalizedCategory, metadata);

    return {
      success: true,
      fact: {
        key: fact.key,
        value: fact.value,
        category: fact.category,
      },
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: recall - Retrieve information from memory
// ============================================================================

export async function recall(
  query: string,
  category?: string,
  includeFiles = false,
  includeSessions = false,
  limit = 10
): Promise<{
  success: boolean;
  summary: string;
  facts?: Array<{
    key: string;
    value: string;
    category: string;
  }>;
  files?: Array<{
    path: string;
    language: string;
    symbolCount: number;
  }>;
  sessions?: Array<{
    sessionId: string;
    summary: string;
    messageCount: number;
  }>;
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    const result = await memory.recall(query, {
      category: category as any,
      includeFiles,
      includeSessions,
      limit,
    });

    return {
      success: true,
      summary: result.summary,
      facts: result.facts.map((f) => ({
        key: f.key,
        value: f.value,
        category: f.category,
      })),
      files: result.files?.map((fc) => ({
        path: fc.file.path,
        language: fc.file.language,
        symbolCount: fc.symbols.length,
      })),
      sessions: result.sessions?.map((s) => ({
        sessionId: s.sessionId,
        summary: s.summary,
        messageCount: s.messageCount,
      })),
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      summary: "",
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: forget - Remove a fact from memory
// ============================================================================

export async function forget(key: string): Promise<{
  success: boolean;
  forgotten?: boolean;
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    const deleted = memory.forget(key);

    return {
      success: true,
      forgotten: deleted,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: get_file_context - Get information about a file
// ============================================================================

export async function getFileContext(
  path: string,
  includeSymbols = true
): Promise<{
  success: boolean;
  file?: {
    path: string;
    language: string;
    size: number;
    lastModified: string;
  };
  symbols?: Array<{
    name: string;
    type: string;
    line: number;
  }>;
  imports?: string[];
  exports?: string[];
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    const context = memory.getFileContext(path);

    if (!context) {
      return {
        success: false,
        error: `File not found in index: ${path}. The file may not exist or hasn't been scanned yet.`,
      };
    }

    return {
      success: true,
      file: {
        path: context.file.path,
        language: context.file.language,
        size: context.file.size,
        lastModified: new Date(context.file.lastModified).toISOString(),
      },
      symbols: includeSymbols
        ? context.symbols.map((s) => ({
            name: s.name,
            type: s.symbolType,
            line: s.lineStart,
          }))
        : [],
      imports: context.imports,
      exports: context.exports,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: find_symbol - Search for a symbol in the project
// ============================================================================

export async function findSymbol(
  name: string,
  type?: string,
  filePath?: string
): Promise<{
  success: boolean;
  symbols?: Array<{
    name: string;
    type: string;
    filePath: string;
    line: number;
  }>;
  count: number;
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    let symbols: any[];

    if (filePath) {
      // Search in specific file
      const context = memory.getFileContext(filePath);
      symbols = context?.symbols.filter((s) =>
        s.name.toLowerCase().includes(name.toLowerCase()) &&
        (!type || s.symbolType === type)
      ) || [];
    } else {
      // Search across all files
      symbols = memory.findSymbol(name, type);
    }

    return {
      success: true,
      symbols: symbols.map((s) => ({
        name: s.name,
        type: s.symbolType,
        filePath: s.filePath,
        line: s.lineStart,
      })),
      count: symbols.length,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      count: 0,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: summarize_session - Get summary of current or past session
// ============================================================================

export async function summarizeSession(sessionId?: string): Promise<{
  success: boolean;
  summary?: {
    sessionId: string;
    summary: string;
    keyTopics: string[];
    decisions: string[];
    filesWorkedOn: string[];
  };
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    // If no sessionId provided, use current session
    const targetId = sessionId || memory.getSessionId();

    if (!targetId) {
      return {
        success: false,
        error: "No active session found",
      };
    }

    const summary = memory.getSessionSummary();

    if (!summary) {
      return {
        success: false,
        error: `Session not found: ${targetId}`,
      };
    }

    return {
      success: true,
      summary: {
        sessionId: summary.sessionId,
        summary: summary.summary,
        keyTopics: summary.keyTopics,
        decisions: summary.decisionMade,
        filesWorkedOn: summary.filesWorkedOn,
      },
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: rescan_project - Trigger a project rescan
// ============================================================================

export async function rescanProject(force = false): Promise<{
  success: boolean;
  result?: {
    filesScanned: number;
    filesAdded: number;
    filesUpdated: number;
    filesRemoved: number;
    symbolsExtracted: number;
    durationMs: number;
  };
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    const result = await memory.rescanProject({ force });

    return {
      success: true,
      result,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: search_files - Search for files by name or content
// ============================================================================

export async function searchFiles(
  query: string,
  limit = 20
): Promise<{
  success: boolean;
  files?: Array<{
    path: string;
    language: string;
    relevance?: number;
  }>;
  count: number;
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();

    const files = memory.searchFiles(query, limit);

    return {
      success: true,
      files: files.map((f: any) => ({
        path: f.path,
        language: f.language,
        relevance: f.importanceScore,
      })),
      count: files.length,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      count: 0,
      error: errorMsg,
    };
  }
}

// ============================================================================
// Tool: get_memory_stats - Get memory system statistics
// ============================================================================

export async function getMemoryStats(): Promise<{
  success: boolean;
  stats?: {
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
  };
  error?: string;
}> {
  try {
    const memory = await getMemoryManager();
    const stats = memory.getStats();

    return {
      success: true,
      stats,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    return {
      success: false,
      error: errorMsg,
    };
  }
}
