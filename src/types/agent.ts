/**
 * Core Agent Types
 * Ported from src/codin/agent/state.py
 */

/**
 * Message role enum - matches Python MessageRole
 */
export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
  TOOL = "tool",
}

/**
 * Message interface - matches Python Message dataclass
 */
export interface Message {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Tool call interface - represents a function call from the LLM
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Todo interface - matches Python Todo dataclass
 */
export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "done";
  activeForm?: string;
  assignee?: string;
}

/**
 * ToolExecution interface - matches Python ToolExecution dataclass
 */
export interface ToolExecution {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * PermissionRule interface - matches Python PermissionRule dataclass
 */
export interface PermissionRule {
  id: string;
  tool: string;
  path_glob: string;
  allow: boolean;
  description: string;
  persistent?: boolean;
}

/**
 * SessionState interface - matches Python SessionState dataclass
 * Note: Python uses 'dry_run_mode' but serializer uses 'dry_run_code'
 * We use 'dry_run_mode' as the canonical name
 */
export interface SessionState {
  messages: Message[];
  todos: Todo[];
  working_directory: string;
  permission_rules: PermissionRule[];
  tool_execution_log: ToolExecution[];
  ui_state: Record<string, unknown>;
  token_usage: Record<string, number>;
  performance_metrics: Record<string, number>;
  dry_run_mode: boolean;
  mode: "default" | "rebuild";
}

/**
 * Create a new empty session state
 */
export function createEmptySessionState(workingDirectory: string = ""): SessionState {
  return {
    messages: [],
    todos: [],
    working_directory: workingDirectory || process.cwd?.() || "",
    permission_rules: [],
    tool_execution_log: [],
    ui_state: {},
    token_usage: {},
    performance_metrics: {},
    dry_run_mode: false,
    mode: "default",
  };
}

/**
 * Add a message to session state
 */
export function addMessageToState(state: SessionState, message: Message): void {
  state.messages.push(message);
}

/**
 * Add a todo to session state
 */
export function addTodoToState(state: SessionState, todo: Todo): void {
  state.todos.push(todo);
}

/**
 * Update todo status in session state
 */
export function updateTodoStatusInState(
  state: SessionState,
  todoId: string,
  status: Todo["status"]
): void {
  const todo = state.todos.find((t) => t.id === todoId);
  if (todo) {
    todo.status = status;
  } else {
    throw new Error(`TODO with id ${todoId} not found`);
  }
}

/**
 * Log a tool execution to session state
 */
export function logToolExecutionToState(
  state: SessionState,
  execution: ToolExecution
): void {
  state.tool_execution_log.push(execution);
}
