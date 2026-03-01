/**
 * Agent Tools (todo_write, task)
 *
 * Manage TODOs and execute sub-agent tasks.
 * Matches the updated schema with object parameters.
 */

import type { SessionState, Todo } from "../types/agent.js";
import type { ToolResult } from "../types/tools.js";
import type { SubAgentManager } from "../types/subagent.js";

/**
 * Result interface for todo_write
 */
interface TodoWriteResult extends ToolResult {
  todos?: Todo[];
  todo?: Todo;
  deleted?: boolean;
  error?: string;
}

/**
 * Input parameters for todo_write (matches schema)
 */
export interface TodoWriteInput {
  operation: "create" | "update" | "list" | "delete" | "bulk_create";
  todos?: Array<{ content: string; status?: Todo["status"]; activeForm?: string; assignee?: string }>;
  todo_id?: string;
  content?: string;
  status?: Todo["status"];
  activeForm?: string;
  state?: SessionState;
}

/**
 * Manage TODO items
 * Create, update, list, or delete TODOs. Use this for multi-step planning and progress tracking.
 * @param input - Todo write parameters as an object
 * @returns Result with todo(s) or error
 */
export async function todoWrite(input: TodoWriteInput): Promise<TodoWriteResult> {
  const { operation, todos, todo_id, content, status, activeForm, state } = input;

  if (!state) {
    return {
      success: false,
      error: "State not provided (auto-injected)",
    };
  }

  try {
    switch (operation) {
      case "create": {
        if (!content) {
          return {
            success: false,
            error: "content is required for create operation",
          };
        }

        const newTodo: Todo = {
          id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content,
          status: status || "pending",
          activeForm: activeForm,
          assignee: undefined,
        };

        state.todos.push(newTodo);

        return {
          success: true,
          todo: newTodo,
        };
      }

      case "bulk_create": {
        if (!todos || todos.length === 0) {
          return {
            success: false,
            error: "todos array is required for bulk_create operation",
          };
        }

        const newTodos: Todo[] = [];
        for (const todo of todos) {
          const newTodo: Todo = {
            id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: todo.content,
            status: todo.status || "pending",
            activeForm: todo.activeForm,
            assignee: undefined,
          };
          state.todos.push(newTodo);
          newTodos.push(newTodo);
        }

        return {
          success: true,
          todos: newTodos,
        };
      }

      case "update": {
        if (!todo_id) {
          return {
            success: false,
            error: "todo_id is required for update operation",
          };
        }

        const todo = state.todos.find((t) => t.id === todo_id);
        if (!todo) {
          return {
            success: false,
            error: `TODO with id ${todo_id} not found`,
          };
        }

        if (content) todo.content = content;
        if (status) todo.status = status;
        if (activeForm !== undefined) todo.activeForm = activeForm;

        return {
          success: true,
          todo,
        };
      }

      case "delete": {
        if (!todo_id) {
          return {
            success: false,
            error: "todo_id is required for delete operation",
          };
        }

        const index = state.todos.findIndex((t) => t.id === todo_id);
        if (index === -1) {
          return {
            success: false,
            error: `TODO with id ${todo_id} not found`,
          };
        }

        state.todos.splice(index, 1);

        return {
          success: true,
          deleted: true,
        };
      }

      case "list": {
        return {
          success: true,
          todos: state.todos.map((t) => ({ ...t })),
        };
      }

      default: {
        return {
          success: false,
          error: `Unknown operation: ${operation}`,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Error in todo_write: ${(error as Error).message}`,
    };
  }
}

/**
 * Result interface for task
 */
interface TaskResult extends ToolResult {
  result?: string;
  token_usage?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Input parameters for task (matches schema)
 */
export interface TaskInput {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: string;
  max_turns?: number;
  run_in_background?: boolean;
  resume?: string;
  subagent_manager?: SubAgentManager;
}

/**
 * Execute a task using an ephemeral sub-agent
 * @param input - Task parameters as an object
 * @returns Task result or error
 */
export async function task(input: TaskInput): Promise<TaskResult> {
  const { description, prompt, subagent_type, model, max_turns, run_in_background, resume, subagent_manager } = input;

  if (!subagent_manager) {
    return {
      success: false,
      error: "subagent_manager not provided (auto-injected)",
    };
  }

  try {
    // Map schema subagent_type to internal types
    const typeMapping: Record<string, string> = {
      "explore": "ANALYZE",
      "general-purpose": "IDEATE",
      "plan": "PLAN",
      "bash": "IDEATE",
      "claude-code-guide": "ANALYZE",
      "agents-design-experience:accessibility-specialist": "ANALYZE",
      "agents-design-experience:ui-ux-designer": "IDEATE",
    };

    const normalizedType = typeMapping[subagent_type] || subagent_type.toUpperCase();

    const result = await subagent_manager.execute_task(prompt, description, normalizedType as any);

    return {
      success: result.success,
      result: result.result,
      error: result.error,
      token_usage: result.token_usage,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error in task: ${(error as Error).message}`,
    };
  }
}
