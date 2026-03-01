/**
 * Todo Manager
 * Ported from src/codin/agent/todo.py
 */

import type { SessionState, Todo } from "../types/agent.js";

/**
 * Todo Manager class
 * Manages todo items within a session state
 */
export class TodoManager {
  private state: SessionState;

  constructor(state: SessionState) {
    this.state = state;
  }

  /**
   * Generate a unique todo ID
   */
  private _generateTodoId(): string {
    return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new todo
   */
  createTodo(content: string, status: Todo["status"] = "pending"): Todo {
    const todo: Todo = {
      id: this._generateTodoId(),
      content,
      status,
    };
    this.state.todos.push(todo);
    return todo;
  }

  /**
   * Bulk create todos
   */
  bulkCreateTodos(
    items: Array<{ content: string; status?: Todo["status"] }>
  ): Todo[] {
    const todos: Todo[] = [];
    for (const item of items) {
      const todo: Todo = {
        id: this._generateTodoId(),
        content: item.content,
        status: item.status || "pending",
      };
      this.state.todos.push(todo);
      todos.push(todo);
    }
    return todos;
  }

  /**
   * Update todo status
   */
  updateTodoStatus(todoId: string, status: Todo["status"]): boolean {
    const todo = this.state.todos.find((t) => t.id === todoId);
    if (todo) {
      todo.status = status;
      return true;
    }
    return false;
  }

  /**
   * Update todo content
   */
  updateTodoContent(todoId: string, content: string): boolean {
    const todo = this.state.todos.find((t) => t.id === todoId);
    if (todo) {
      todo.content = content;
      return true;
    }
    return false;
  }

  /**
   * Delete a todo
   */
  deleteTodo(todoId: string): boolean {
    const index = this.state.todos.findIndex((t) => t.id === todoId);
    if (index !== -1) {
      this.state.todos.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all todos
   */
  getTodos(): Todo[] {
    return [...this.state.todos];
  }

  /**
   * Get todo by ID
   */
  getTodoById(todoId: string): Todo | undefined {
    return this.state.todos.find((t) => t.id === todoId);
  }

  /**
   * Get todos by status
   */
  getTodosByStatus(status: Todo["status"]): Todo[] {
    return this.state.todos.filter((t) => t.status === status);
  }

  /**
   * Clear all todos
   */
  clearTodos(): void {
    this.state.todos = [];
  }
}
