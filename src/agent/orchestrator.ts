/**
 * Agent Orchestrator
 * Ported from src/codin/agent/orchestrator.py
 */

import type { SessionState, Message } from "../types/agent.js";
import { MessageRole } from "../types/agent.js";
import type { LLMConfig } from "../types/llm.js";
import { PermissionDecision } from "../types/permissions.js";
import type { ToolDefinition } from "../types/tools.js";

import { PermissionEngine } from "./permission-engine";
import { ToolExecutor } from "./tool-executor";
import { TodoManager } from "./todo-manager";
import { SubAgentManager } from "./subagent";
import { ContextManager } from "./context-manager";
import { ErrorRecoveryManager } from "./error-recovery";
import { ChangePreviewManager } from "./change-preview";
import { createLLMGateway } from "./llm-gateway";
import { ConfigLoader } from "../runtime/config.js";
import { PromptLoader } from "../runtime/prompt.js";
import { ToolSchemaLoader } from "../runtime/tool-schema.js";

/**
 * Callback types
 */
type MessageCallback = (message: Message) => void;
type ToolCallCallback = (toolName: string, toolArgs: Record<string, unknown>) => void;
type ToolResultCallback = (result: unknown) => void;
type ApprovalCallback = Parameters<
  PermissionEngine["setApprovalCallback"]
>[0];

/**
 * Rebuild tool set
 */
const REBUILD_TOOLS = new Set([
  "rebuild_init",
  "capture_site",
  "extract_design_tokens",
  "extract_component_map",
  "harvest_assets",
  "generate_code",
  "visual_diff",
  "auto_fix_pass",
  "rebuild_finalize",
]);

/**
 * Rebuild mode prompt suffix
 */
const REBUILD_PROMPT_SUFFIX = `
## Rebuild Mode

You are in rebuild mode for high-fidelity website replication.
Follow this sequence unless user asks otherwise:
1) rebuild_init
2) capture_site
3) extract_design_tokens + extract_component_map + harvest_assets
4) generate_code
5) visual_diff
6) auto_fix_pass (repeat if needed)
7) rebuild_finalize

Always ensure permission_confirmed=true before rebuild_init.
`;

/**
 * Agent Orchestrator class
 * Main orchestrator that coordinates the agent's decision-making and execution
 */
export class AgentOrchestrator {
  state: SessionState;
  llmGateway: ReturnType<typeof createLLMGateway>;
  toolExecutor: ToolExecutor;
  permissionEngine: PermissionEngine;
  todoManager: TodoManager;

  private baseSystemPrompt: string;
  public systemPrompt: string;
  private allTools: ToolDefinition[];
  public tools: ToolDefinition[];

  // Callbacks for UI integration
  private _onMessage: MessageCallback | null = null;
  private _onToolCall: ToolCallCallback | null = null;
  private _onToolResult: ToolResultCallback | null = null;

  private contextManager: ContextManager | null = null;
  private errorRecovery: ErrorRecoveryManager | null = null;
  private changePreview: ChangePreviewManager | null = null;

  // Sub-Agent Manager
  public subagentManager: SubAgentManager;

  private sessionPersistence: any = null; // TODO: when session persistence is implemented
  public currentSessionId: string | null = null;

  constructor(
    llmConfig: LLMConfig,
    workingDirectory: string = "",
    systemPrompt: string = "",
    tools?: ToolDefinition[],
    enableContextManagement = true,
    enableErrorRecovery = true,
    enableChangePreview = true
  ) {
    // Initialize state
    this.state = {
      messages: [],
      todos: [],
      working_directory: workingDirectory,
      permission_rules: [],
      tool_execution_log: [],
      ui_state: {},
      token_usage: {},
      performance_metrics: {},
      dry_run_mode: false,
      mode: "default",
    };

    // Initialize LLM gateway
    this.llmGateway = createLLMGateway(llmConfig);

    // Initialize tool executor
    this.toolExecutor = new ToolExecutor(workingDirectory);

    // Initialize permission engine
    this.permissionEngine = new PermissionEngine(this.state);

    // Initialize todo manager
    this.todoManager = new TodoManager(this.state);

    // Store base system prompt
    this.baseSystemPrompt = systemPrompt;
    this.systemPrompt = systemPrompt;

    // Store all tools
    this.allTools = tools || [];
    this.tools = [];

    // Initialize optional components
    this.contextManager = enableContextManagement ? new ContextManager() : null;
    this.errorRecovery = enableErrorRecovery ? new ErrorRecoveryManager() : null;
    this.changePreview = enableChangePreview
      ? new ChangePreviewManager(workingDirectory)
      : null;

    // Initialize sub-agent manager
    this.subagentManager = new SubAgentManager(llmConfig);

    // Initialize mode + active tools
    this.setMode("default");
  }

  /**
   * Filter tools for a specific mode
   */
  private _filterToolsForMode(mode: string): ToolDefinition[] {
    if (mode === "rebuild") {
      return this.allTools;
    }
    return this.allTools.filter(
      (tool) => !REBUILD_TOOLS.has(tool.name)
    );
  }

  /**
   * Build prompt for a specific mode
   */
  private _buildPromptForMode(mode: string): string {
    if (mode === "rebuild") {
      return `${this.baseSystemPrompt}\n\n${REBUILD_PROMPT_SUFFIX.trim()}`;
    }
    return this.baseSystemPrompt;
  }

  /**
   * Set the agent mode
   */
  setMode(mode: "default" | "rebuild"): void {
    this.state.mode = mode;
    this.tools = this._filterToolsForMode(mode);
    this.systemPrompt = this._buildPromptForMode(mode);
  }

  /**
   * Get the current agent mode
   */
  getMode(): string {
    return this.state.mode;
  }

  /**
   * Set callback for when messages are added
   */
  setMessageCallback(callback: MessageCallback): void {
    this._onMessage = callback;
  }

  /**
   * Set callback for when tools are called
   */
  setToolCallCallback(callback: ToolCallCallback): void {
    this._onToolCall = callback;
  }

  /**
   * Set callback for when tool results are received
   */
  setToolResultCallback(callback: ToolResultCallback): void {
    this._onToolResult = callback;
  }

  /**
   * Set callback for requesting user approval
   */
  setApprovalCallback(callback: ApprovalCallback): void {
    this.permissionEngine.setApprovalCallback(callback);
  }

  /**
   * Process user input and run agent loop
   */
  async processUserInput(userInput: string): Promise<void> {
    // Add user message
    const userMessage: Message = {
      role: MessageRole.USER,
      content: userInput,
    };
    this.state.messages.push(userMessage);

    if (this._onMessage) {
      this._onMessage(userMessage);
    }

    // Run agent loop
    await this._agentLoop();
  }

  /**
   * Inject a user message directly into the conversation
   * Used for permission feedback and other user interactions
   */
  injectUserMessage(content: string): void {
    const userMessage: Message = {
      role: MessageRole.USER,
      content,
    };
    this.state.messages.push(userMessage);

    if (this._onMessage) {
      this._onMessage(userMessage);
    }
  }

  /**
   * Main agent execution loop
   */
  private async _agentLoop(maxIterations = 50): Promise<void> {
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Optimize context if manager available
      let messagesToSend = this.state.messages;
      if (this.contextManager) {
        messagesToSend = this.contextManager.optimizeContext(
          this.state.messages,
          this.systemPrompt,
          this.tools
        );
      }

      // Call LLM
      const response = await this.llmGateway.call(
        messagesToSend,
        this.tools,
        this.systemPrompt
      );

      // Update token usage if context manager available
      if (this.contextManager) {
        const inputTokens = this.contextManager.countMessagesTokens(
          messagesToSend
        );
        const outputTokens = this.contextManager.estimateTokens(
          response.content || ""
        );
        this.contextManager.updateTokenUsage(inputTokens, outputTokens);
      }

      // Add assistant message
      const assistantMessage: Message = {
        role: MessageRole.ASSISTANT,
        content: response.content || "",
        tool_calls: response.tool_calls || undefined,
      };
      this.state.messages.push(assistantMessage);

      if (this._onMessage) {
        this._onMessage(assistantMessage);
      }

      // If there are tool calls, execute them
      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.name;
          const toolArgsFromCall = toolCall.arguments;
          const toolCallId = toolCall.id;

          if (this._onToolCall) {
            this._onToolCall(toolName, toolArgsFromCall);
          }

          // Check permissions
          const [decision, reason] =
            await this.permissionEngine.checkPermission(
              toolName,
              toolArgsFromCall
            );

          if (decision === PermissionDecision.DENY) {
            // Add error message
            const errorMsg: Message = {
              role: MessageRole.TOOL,
              content: `Permission denied: ${reason}`,
              tool_call_id: toolCallId,
              name: toolName,
            };
            this.state.messages.push(errorMsg);
            continue;
          }

          if (decision === PermissionDecision.PROMPT) {
            // Should have been handled by callback, but if not, deny
            const errorMsg: Message = {
              role: MessageRole.TOOL,
              content: `Permission required but no approval callback set: ${reason}`,
              tool_call_id: toolCallId,
              name: toolName,
            };
            this.state.messages.push(errorMsg);
            continue;
          }

          // Prepare arguments for tool execution
          let toolArgs = { ...toolArgsFromCall };

          // Inject state for todo_write tool
          if (toolName === "todo_write") {
            toolArgs.state = this.state;
          }

          // Inject subagent_manager for task tool
          if (toolName === "task") {
            toolArgs.subagent_manager = this.subagentManager;
          }

          // Execute with retry if error recovery enabled
          let execution: Awaited<
            ReturnType<ToolExecutor["execute"]>
          >;
          if (this.errorRecovery) {
            // Create a wrapper function that matches executeWithRetry's expected signature
            const wrapper = (...args: unknown[]) => {
              return this.toolExecutor.execute(
                args[0] as string,
                args[1] as Record<string, unknown>
              );
            };
            execution = await this.errorRecovery.executeWithRetry(
              wrapper,
              toolName,
              toolArgs
            );
          } else {
            execution = await this.toolExecutor.execute(toolName, toolArgs);
          }

          this.state.tool_execution_log.push(execution);

          // Format result
          const resultText = this.toolExecutor.formatToolResult(execution);

          // Add tool result message
          const toolResultMsg: Message = {
            role: MessageRole.TOOL,
            content: resultText,
            tool_call_id: toolCallId,
            name: toolName,
          };
          this.state.messages.push(toolResultMsg);

          if (this._onToolResult) {
            this._onToolResult(execution);
          }
        }

        // Continue loop to process tool results
        continue;
      }

      // No tool calls - check if we should stop
      if (
        response.finish_reason === "stop" ||
        response.finish_reason === "end_turn"
      ) {
        break;
      }
    }

    // Max iterations reached
    if (iteration >= maxIterations) {
      const warningMsg: Message = {
        role: MessageRole.SYSTEM,
        content: "Maximum iterations reached. Agent loop stopped.",
      };
      this.state.messages.push(warningMsg);
    }
  }

  /**
   * Save current session to disk
   */
  async saveSession(name?: string, description?: string): Promise<string> {
    // TODO: Implement with SessionPersistence when imported
    const sessionId = this.currentSessionId || "";
    // For now, return placeholder
    return sessionId;
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<boolean> {
    // TODO: Implement with SessionPersistence when imported
    return false;
  }

  /**
   * List all saved sessions
   */
  async listSessions(): Promise<Record<string, unknown>[]> {
    // TODO: Implement with SessionPersistence when imported
    return [];
  }

  /**
   * List all saved sessions (alias)
   */
  async listSession(): Promise<Record<string, unknown>[]> {
    return this.listSessions();
  }

  /**
   * Export current session
   */
  async exportSession(exportPath: string, format: "json" | "markdown" = "json"): Promise<boolean> {
    // TODO: Implement with SessionPersistence when imported
    return false;
  }

  /**
   * Start a new session
   */
  newSession(workingDirectory?: string): void {
    const wd = workingDirectory || this.state.working_directory;
    const currentMode = this.state.mode;

    this.state = {
      messages: [],
      todos: [],
      working_directory: wd,
      permission_rules: [],
      tool_execution_log: [],
      ui_state: {},
      token_usage: {},
      performance_metrics: {},
      dry_run_mode: false,
      mode: currentMode,
    };
    this.currentSessionId = null;
  }
}
