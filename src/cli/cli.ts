/**
 * CLI Interface
 * Ported from src/codin/cli/cli.py
 */

import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

import { AgentOrchestrator } from "../agent/index.js";
import { ConfigLoader } from "../runtime/config.js";
import { PromptLoader } from "../runtime/prompt.js";
import { ToolSchemaLoader } from "../runtime/tool-schema.js";

/**
 * Main CLI entry point
 * Ported from Python's run_cli()
 */
export async function runCli(options: {
  config?: string;
  prompts?: string;
  workingDirectory?: string;
} = {}): Promise<AgentOrchestrator> {
  // Initialize loaders
  const configLoader = new ConfigLoader(options.config);
  const promptLoader = new PromptLoader(options.prompts);
  const toolSchemaLoader = new ToolSchemaLoader();

  // Load configuration
  const llmConfig = await configLoader.getLLMConfig();
  const workingDirectory = await configLoader.getWorkingDirectory();

  // Load system prompt
  const systemPrompt = await promptLoader.buildFullPrompt();

  // Load tool schemas
  const tools = await toolSchemaLoader.formatForLLM();

  // Create orchestrator
  const orchestrator = new AgentOrchestrator(
    llmConfig,
    workingDirectory,
    systemPrompt,
    tools,
    true, // enable context management
    true, // enable error recovery
    true // enable change preview
  );

  return orchestrator;
}

/**
 * Handle session command
 * Ported from Python's handle_session_command
 */
export async function handleSessionCommand(
  orchestrator: AgentOrchestrator,
  command: string,
  args: string[]
): Promise<string> {
  const [action, ...rest] = args;

  switch (action) {
    case "save":
      const sessionId = orchestrator.currentSessionId || "";
      // TODO: Implement session persistence
      return `Session ${sessionId || "new"} would be saved here`;

    case "load":
      const loadId = rest[0];
      // TODO: Implement session loading
      return `Session ${loadId} would be loaded here`;

    case "list":
      // TODO: Implement session listing
      return "Sessions would be listed here";

    case "new":
      orchestrator.currentSessionId = null;
      orchestrator.state.messages = [];
      orchestrator.state.todos = [];
      return "Started new session";

    default:
      return `Unknown session action: ${action}`;
  }
}

/**
 * Handle mode command
 * Ported from Python's handle_mode_command
 */
export function handleModeCommand(
  orchestrator: AgentOrchestrator,
  mode: string
): string {
  try {
    orchestrator.setMode(mode as "default" | "rebuild");
    return `Mode set to ${mode}`;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * Handle permission request
 * Ported from Python's handle_permission_request
 */
export function handlePermissionRequest(
  request: {
    tool_name: string;
    arguments: Record<string, unknown>;
    affected_files: string[];
    risk_level: string;
  }
): "allow" | "deny" {
  // For CLI, this would prompt the user
  // For now, auto-allow low risk operations
  if (request.risk_level === "low") {
    return "allow";
  }

  // For higher risk, deny by default in CLI mode
  // (Would be interactive in TUI mode)
  return "deny";
}
