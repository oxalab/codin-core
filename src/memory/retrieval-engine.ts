/**
 * Retrieval Engine
 * Detects when to retrieve memory and executes searches
 * Cost-conscious: only retrieves when stuck or explicitly requested
 */

import type {
  RetrievalTrigger,
  RetrievalRequest,
  RetrievalResult,
  StuckLoopDetection,
  HallucinationDetection,
  RecallResult,
} from "./types.js";
import {
  SemanticMemory,
  createFactKey,
} from "./semantic-memory.js";
import { ProjectIndex } from "./project-index.js";
import { ConversationMemory } from "./conversation-memory.js";

// ============================================================================
// Stuck Loop Detection
// ============================================================================

interface LoopPattern {
  action: string;
  count: number;
  firstSeen: number;
}

export class StuckLoopDetector {
  private recentActions: Map<string, number[]> = new Map();
  private windowMs = 30000; // 30 second window
  private threshold = 3; // Same action 3+ times

  record(action: string): void {
    const now = Date.now();
    const times = this.recentActions.get(action) || [];

    // Add current time and remove old times
    times.push(now);
    const recent = times.filter((t) => now - t < this.windowMs);
    this.recentActions.set(action, recent);
  }

  detect(): StuckLoopDetection {
    const now = Date.now();

    for (const [action, times] of this.recentActions.entries()) {
      // Clean old times
      const recent = times.filter((t) => now - t < this.windowMs);
      this.recentActions.set(action, recent);

      if (recent.length >= this.threshold) {
        return {
          isStuck: true,
          pattern: action,
          iterations: recent.length,
        };
      }
    }

    return { isStuck: false, iterations: 0 };
  }

  reset(): void {
    this.recentActions.clear();
  }

  /**
   * Create a signature for tool calls to detect repetition
   */
  static toolSignature(toolName: string, args: Record<string, unknown>): string {
    // Normalize args for comparison
    const normalized = Object.keys(args)
      .sort()
      .map((k) => `${k}=${JSON.stringify(args[k])}`)
      .join("&");
    return `${toolName}?${normalized}`;
  }
}

// ============================================================================
// Hallucination Detection
// ============================================================================

export class HallucinationDetector {
  private contradictions: Array<{ contradiction: string; count: number; firstSeen: number }> = [];
  private windowMs = 60000; // 1 minute window

  /**
   * Check for contradictions between LLM claims and tool results
   */
  check(llmOutput: string, toolResults: Array<{ tool: string; result: string }>): HallucinationDetection {
    let maxConfidence = 0;
    let detectedContradiction: string | undefined;

    for (const { tool, result } of toolResults) {
      // Check if LLM claimed something that tool result contradicts
      const contradiction = this.findContradiction(llmOutput, tool, result);
      if (contradiction) {
        const confidence = this.calculateConfidence(llmOutput, contradiction);
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          detectedContradiction = contradiction;
        }
      }
    }

    if (detectedContradiction && maxConfidence > 0.7) {
      return {
        isHallucinating: true,
        contradiction: detectedContradiction,
        confidence: maxConfidence,
      };
    }

    return { isHallucinating: false, confidence: 0 };
  }

  /**
   * Find contradiction between LLM output and tool result
   */
  private findContradiction(llmOutput: string, tool: string, result: string): string | undefined {
    const resultLower = result.toLowerCase();
    const outputLower = llmOutput.toLowerCase();

    // Common contradictions to detect
    const patterns = [
      {
        // LLM says file exists but tool says not found
        llmPattern: /file\s+["']?(.+?)["']?\s+exists/i,
        resultIndicator: "not found",
        contradiction: "File existence",
      },
      {
        // LLM says can do something but tool says error
        llmPattern: /can\s+(?:read|write|access|modify)\s+["']?(.+?)["']?/i,
        resultIndicator: "permission denied",
        contradiction: "Permission",
      },
      {
        // LLM says function exists but tool says undefined
        llmPattern: /function\s+(\w+)\s+exists/i,
        resultIndicator: "is not defined",
        contradiction: "Function definition",
      },
    ];

    for (const { llmPattern, resultIndicator, contradiction } of patterns) {
      const llmMatch = llmOutput.match(llmPattern);
      if (llmMatch && resultLower.includes(resultIndicator)) {
        return `${contradiction}: ${llmMatch[1]}`;
      }
    }

    // Check for explicit errors in tool results that LLM ignored
    if (resultLower.includes("error") && !outputLower.includes("error") && !outputLower.includes("failed")) {
      const errorMatch = result.match(/error:?\s*(.+)/i);
      if (errorMatch) {
        return `Unacknowledged error: ${errorMatch[1].trim()}`;
      }
    }

    return undefined;
  }

  /**
   * Calculate confidence that this is a hallucination
   */
  private calculateConfidence(llmOutput: string, contradiction: string): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence if LLM used definitive language
    if (/definitely|certainly|absolutely|guaranteed/i.test(llmOutput)) {
      confidence += 0.2;
    }

    // Higher confidence if LLM continued as if nothing wrong
    if (!/sorry|apologize|mistake|incorrect/i.test(llmOutput)) {
      confidence += 0.2;
    }

    // Higher confidence if contradiction is repeated
    const existing = this.contradictions.find((c) => c.contradiction.includes(contradiction.split(":")[0]));
    if (existing) {
      confidence += Math.min(0.3, existing.count * 0.1);
    }

    return Math.min(1, confidence);
  }

  reset(): void {
    this.contradictions = [];
  }
}

// ============================================================================
// Retrieval Engine
// ============================================================================

export class RetrievalEngine {
  private semanticMemory: SemanticMemory;
  private projectIndex: ProjectIndex;
  private conversationMemory: ConversationMemory;
  private stuckDetector: StuckLoopDetector;
  private hallucinationDetector: HallucinationDetector;

  constructor(
    semanticMemory: SemanticMemory,
    projectIndex: ProjectIndex,
    conversationMemory: ConversationMemory
  ) {
    this.semanticMemory = semanticMemory;
    this.projectIndex = projectIndex;
    this.conversationMemory = conversationMemory;
    this.stuckDetector = new StuckLoopDetector();
    this.hallucinationDetector = new HallucinationDetector();
  }

  /**
   * Check if retrieval should be triggered
   */
  shouldRetrieve(request: RetrievalRequest): boolean {
    switch (request.trigger) {
      case "explicit":
      case "tool_call":
        return true;

      case "stuck_loop":
        return this.stuckDetector.detect().isStuck;

      case "hallucination":
        return this.hallucinationDetector.check(
          request.context?.currentMessage || "",
          request.context?.recentErrors?.map((e) => ({ tool: "unknown", result: e })) || []
        ).isHallucinating;

      case "new_file":
        if (request.context?.filePath) {
          const context = this.projectIndex.getFileContext(request.context.filePath);
          return !context; // Retrieve if file not indexed
        }
        return false;

      case "error_recovery":
        return request.context?.recentErrors ? request.context.recentErrors.length > 2 : false;

      default:
        return false;
    }
  }

  /**
   * Execute retrieval based on trigger
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const startTime = Date.now();
    const result: RetrievalResult = {
      trigger: request.trigger,
      facts: [],
      suggestions: [],
    };

    switch (request.trigger) {
      case "stuck_loop":
        return await this.retrieveForStuckLoop(request);

      case "hallucination":
        return await this.retrieveForHallucination(request);

      case "explicit":
      case "tool_call":
        return await this.retrieveForQuery(request);

      case "new_file":
        return await this.retrieveForNewFile(request);

      case "error_recovery":
        return await this.retrieveForErrorRecovery(request);
    }

    return result;
  }

  /**
   * Record an action for stuck loop detection
   */
  recordAction(action: string): void {
    this.stuckDetector.record(action);
  }

  /**
   * Check for hallucination
   */
  checkHallucination(llmOutput: string, toolResults: Array<{ tool: string; result: string }>): HallucinationDetection {
    return this.hallucinationDetector.check(llmOutput, toolResults);
  }

  // ========================================================================
  // Trigger-Specific Retrieval
  // ========================================================================

  private async retrieveForStuckLoop(request: RetrievalRequest): Promise<RetrievalResult> {
    const stuck = this.stuckDetector.detect();
    const pattern = stuck.pattern || request.context?.currentMessage || "";

    const facts = this.semanticMemory.search(pattern, "pattern", 5);
    const sessionResults = this.conversationMemory.searchSessions(pattern, 3);

    const suggestions: string[] = [];
    if (facts.length > 0) {
      suggestions.push(`Found ${facts.length} relevant patterns from past experience.`);
    }
    if (sessionResults.length > 0) {
      suggestions.push(`Found ${sessionResults.length} similar past conversations.`);
    }

    return {
      trigger: request.trigger,
      facts,
      pastSessions: sessionResults.map((r) => r.session),
      suggestions,
    };
  }

  private async retrieveForHallucination(request: RetrievalRequest): Promise<RetrievalResult> {
    const hallucination = this.hallucinationDetector.check(
      request.context?.currentMessage || "",
      request.context?.recentErrors?.map((e) => ({ tool: "unknown", result: e })) || []
    );

    const facts: any[] = [];
    const suggestions: string[] = [];

    if (hallucination.contradiction) {
      suggestions.push(`Detected potential hallucination: ${hallucination.contradiction}`);
      suggestions.push("Retrieving verified facts to correct the issue...");

      const keywords = hallucination.contradiction.split(" ").slice(0, 3);
      for (const keyword of keywords) {
        const related = this.semanticMemory.search(keyword, "fact", 3);
        facts.push(...related);
      }
    }

    return {
      trigger: request.trigger,
      facts: facts.slice(0, 5),
      suggestions,
    };
  }

  private async retrieveForQuery(request: RetrievalRequest): Promise<RetrievalResult> {
    const query = request.context?.currentMessage || "";

    const facts = this.semanticMemory.search(query, undefined, 10);

    const relevantFiles: any[] = [];
    if (request.context?.filePath) {
      const fileContext = this.projectIndex.getFileContext(request.context.filePath);
      if (fileContext) {
        relevantFiles.push(fileContext);
      }
    }

    const matchingFiles = this.projectIndex.searchFiles(query, 5);
    for (const file of matchingFiles) {
      const context = this.projectIndex.getFileContext(file.path);
      if (context) {
        relevantFiles.push(context);
      }
    }

    const sessionResults = this.conversationMemory.searchSessions(query, 3);

    const suggestions: string[] = [];
    if (facts.length > 0) suggestions.push(`Found ${facts.length} relevant facts.`);
    if (relevantFiles.length > 0) suggestions.push(`Found ${relevantFiles.length} relevant files.`);
    if (sessionResults.length > 0) suggestions.push(`Found ${sessionResults.length} relevant past sessions.`);

    return {
      trigger: request.trigger,
      facts,
      relevantFiles,
      pastSessions: sessionResults.map((r) => r.session),
      suggestions,
    };
  }

  private async retrieveForNewFile(request: RetrievalRequest): Promise<RetrievalResult> {
    const filePath = request.context?.filePath;
    if (!filePath) {
      return {
        trigger: request.trigger,
        facts: [],
        suggestions: ["No file path provided for retrieval."],
      };
    }

    const relevantFiles: any[] = [];

    const fileContext = this.projectIndex.getFileContext(filePath);
    if (fileContext) {
      relevantFiles.push(fileContext);
    }

    const symbols = this.projectIndex.searchSymbols(filePath.split("/").pop() || "", 10);
    const relatedPaths = new Set<string>();
    for (const symbol of symbols) {
      if (symbol.filePath !== filePath) {
        relatedPaths.add(symbol.filePath);
      }
    }

    for (const relatedPath of relatedPaths) {
      const context = this.projectIndex.getFileContext(relatedPath);
      if (context) {
        relevantFiles.push(context);
      }
    }

    const suggestions: string[] = [];
    if (relevantFiles.length > 0) {
      suggestions.push(`Found ${relevantFiles.length} related files in project index.`);
    } else {
      suggestions.push("File not found in project index. Consider running a project scan.");
    }

    return {
      trigger: request.trigger,
      facts: [],
      relevantFiles,
      suggestions,
    };
  }

  private async retrieveForErrorRecovery(request: RetrievalRequest): Promise<RetrievalResult> {
    const errors = request.context?.recentErrors || [];

    const facts: any[] = [];
    for (const error of errors.slice(0, 3)) {
      const errorKeywords = error.split(/\s+/).slice(0, 3);
      for (const keyword of errorKeywords) {
        const related = this.semanticMemory.search(keyword, "pattern", 2);
        facts.push(...related);
      }
    }

    const sessionResults: any[] = [];
    for (const error of errors.slice(0, 2)) {
      const results = this.conversationMemory.searchSessions(error, 2);
      sessionResults.push(...results);
    }

    const suggestions: string[] = [];
    if (facts.length > 0) {
      suggestions.push(`Found ${facts.length} potentially relevant solutions from past errors.`);
    }
    if (sessionResults.length > 0) {
      suggestions.push(`Found ${sessionResults.length} past sessions with similar errors.`);
    }

    return {
      trigger: request.trigger,
      facts: facts.slice(0, 5),
      pastSessions: sessionResults.slice(0, 3).map((r) => r.session),
      suggestions,
    };
  }

  /**
   * General recall method for agent use
   */
  async recall(query: string, options?: {
    category?: string;
    includeFiles?: boolean;
    includeSessions?: boolean;
    limit?: number;
  }): Promise<RecallResult> {
    const facts = this.semanticMemory.search(
      query,
      options?.category as any,
      options?.limit || 10
    );

    const files: any[] = [];
    if (options?.includeFiles) {
      const matchingFiles = this.projectIndex.searchFiles(query, options.limit || 5);
      for (const file of matchingFiles) {
        const context = this.projectIndex.getFileContext(file.path);
        if (context) {
          files.push(context);
        }
      }
    }

    const sessions: any[] = [];
    if (options?.includeSessions) {
      const sessionResults = this.conversationMemory.searchSessions(query, options.limit || 3);
      for (const result of sessionResults) {
        sessions.push(result.session);
      }
    }

    const summaryParts: string[] = [];
    if (facts.length > 0) summaryParts.push(`${facts.length} facts`);
    if (files.length > 0) summaryParts.push(`${files.length} files`);
    if (sessions.length > 0) summaryParts.push(`${sessions.length} sessions`);

    return {
      facts,
      files,
      sessions,
      summary: summaryParts.length > 0
        ? `Retrieved ${summaryParts.join(", ")}.`
        : "No relevant information found.",
    };
  }

  /**
   * Reset detector state
   */
  resetDetectors(): void {
    this.stuckDetector.reset();
    this.hallucinationDetector.reset();
  }
}
