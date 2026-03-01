/**
 * Agent Layer
 * Export all agent components
 */

// Core agent types
export type {
  Message,
  MessageRole,
  Todo,
  ToolExecution,
  PermissionRule,
  SessionState,
  ToolCall,
  createEmptySessionState,
  addMessageToState,
  addTodoToState,
  updateTodoStatusInState,
  logToolExecutionToState,
} from "../types/agent.js";

// LLM types
export type { LLMProvider, LLMConfig, LLMResponse } from "../types/llm.js";

// Permission types
export type {
  PermissionDecision,
  RiskLevel,
  PermissionRequest,
} from "../types/permissions.js";

// SubAgent types
export type { SubAgentTaskType, SubAgentResult } from "../types/subagent.js";

// Agent classes
export { AgentOrchestrator } from "./orchestrator";
export { PermissionEngine } from "./permission-engine";
export { ToolExecutor } from "./tool-executor";
export { TodoManager } from "./todo-manager";
export { SubAgent, SubAgentManager } from "./subagent";
export { ContextManager } from "./context-manager";
export { ErrorRecoveryManager } from "./error-recovery";
export { ChangePreviewManager } from "./change-preview";

// LLM Gateway
export {
  LLMGateway,
  AnthropicGateway,
  OpenAIGateway,
  OpenRouterGateway,
  createLLMGateway,
} from "./llm-gateway";
