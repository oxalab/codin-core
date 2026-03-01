/**
 * TUI Types
 * No React-specific types - pure domain types
 */

import type { TextareaRenderable } from "@opentui/core"

export type Screen = "prompt" | "chat"

export interface TabOption {
  name: string
  description: string
}

export interface OverlayOption {
  id: string
  label: string
  description?: string
  category?: string
  shortcut?: string
  icon?: string
  value: string
}

/**
 * Agent message types for hybrid display
 */
export type AgentMessageType = "thinking" | "tool_call" | "tool_result" | "permission" | "assistant" | "error" | "user"

export interface BaseAgentMessage {
  id: string
  type: AgentMessageType
  timestamp: number
}

export interface ThinkingMessage extends BaseAgentMessage {
  type: "thinking"
  content: string
  complete: boolean
}

export interface ToolCallMessage extends BaseAgentMessage {
  type: "tool_call"
  toolName: string
  status: "running" | "complete" | "error"
  summary: string
  arguments?: Record<string, unknown>
  result?: Record<string, unknown> | {
    success: boolean
    output?: string
    error?: string
    exitCode?: number | null
  }
  expanded?: boolean
}

export interface ToolResultMessage extends BaseAgentMessage {
  type: "tool_result"
  toolName: string
  content?: string
  summary: string
  success: boolean
}

export interface PermissionMessage extends BaseAgentMessage {
  type: "permission"
  toolName: string
  arguments: Record<string, unknown>
  riskLevel: string
  options: PermissionOption[]
  selectedIndex: number
}

export interface AssistantMessage extends BaseAgentMessage {
  type: "assistant"
  content: string
}

export interface UserMessage extends BaseAgentMessage {
  type: "user"
  content: string
}

export interface ErrorMessage extends BaseAgentMessage {
  type: "error"
  content: string
}

export type AgentMessage = ThinkingMessage | ToolCallMessage | ToolResultMessage | PermissionMessage | AssistantMessage | UserMessage | ErrorMessage

export interface PermissionOption {
  id: string
  label: string
  description: string
  type: "allow_session" | "allow_once" | "custom"
}

export interface AgentState {
  isProcessing: boolean
  messages: AgentMessage[]
  pendingPermission: PermissionMessage | null
}

export interface PermissionResponse {
  type: string
  customResponse?: string
  tool?: string
}

export interface CommandOption {
  id: string
  label: string
  description: string
  shortcut?: string
  category?: string
  action: () => void
}
