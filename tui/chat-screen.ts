/**
 * Chat Screen Component
 * Clean, self-contained chat interface with inline permissions
 */

import {
  Box,
  Text,
  Input,
  ScrollBox,
  ScrollBoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  type VNode,
  type BoxRenderable,
  type RootRenderable,
} from "@opentui/core"
import { appState, triggerRebuild } from "./state"
import type { AgentMessage, PermissionMessage, ToolCallMessage } from "./types"
import type { Theme } from "./themes"
import { processUserInput } from "./agent-binding"
import { setScrollBoxElement } from "./keyboard"

let chatInputElement: InputRenderable | null = null
let scrollBoxElement: ScrollBoxRenderable | null = null

/**
 * Create the chat screen
 */
export function createChatScreen(contentRoot: RootRenderable | BoxRenderable | null): VNode {
  const theme = appState.currentTheme
  const messages = appState.agentState.messages
  const pendingPermission = appState.agentState.pendingPermission
  const allMessages = pendingPermission ? [...messages, pendingPermission] : messages

  // Set up input handler after render
  setTimeout(() => {
    if (!contentRoot) return

    const input = contentRoot.findDescendantById("chat-input") as InputRenderable | null
    if (input) {
      chatInputElement = input
      input.focus()

      input.on(InputRenderableEvents.ENTER, (value: string) => {
        if (value.trim() && !appState.agentState.isProcessing && appState.orchestrator) {
          processUserInput(value.trim())
          input.value = ""
        }
      })
    }

    const scrollBox = contentRoot.findDescendantById("chat-scrollbox") as ScrollBoxRenderable | null
    if (scrollBox) {
      scrollBoxElement = scrollBox
      setScrollBoxElement(scrollBox)
      scrollToBottom()
    }
  }, 50)

  return Box(
    {
      id: "chat-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.background,
    },
    // Messages area
    Box(
      { flexGrow: 1, minHeight: 0 },
      ScrollBox(
        {
          id: "chat-scrollbox",
          width: "100%",
          height: "100%",
          scrollY: true,
          stickyScroll: true,
          stickyStart: "bottom",
        },
        Box(
          { flexDirection: "column", paddingTop: 1, paddingBottom: 1 },
          ...(allMessages.length === 0
            ? [Box({ alignItems: "center", paddingTop: 4 }, Text({ content: "Start a conversation", fg: theme.textDim }))]
            : allMessages.map(msg => createMessageView(msg, theme)))
        )
      )
    ),

    // Status bar
    appState.agentState.isProcessing && !pendingPermission
      ? Box(
          { flexDirection: "row", paddingX: 2, height: 1, backgroundColor: theme.backgroundLight, width:"95%", marginLeft:"2.5%"},
          Text({ content: "⏳ Processing...", fg: theme.warning })
        )
      : null,

    // Input area
    createChatInputArea(theme)
  )
}

/**
 * Create chat input area
 */
function createChatInputArea(theme: Theme): VNode {
  const hasPermission = appState.agentState.pendingPermission != null
  const processing = appState.agentState.isProcessing

  return Box(
    {
      flexDirection: "column",
      paddingX: 2,
      paddingY: 1,
      backgroundColor: theme.chatInputBg,
      width: "95%",
      marginLeft: "2.5%"
    },
    // Mode/Model bar
    Box(
      { flexDirection: "row", marginBottom: 1 },
      Text({ content: appState.selectedMode, fg: theme.secondary }),
      Text({ content: " · ", fg: theme.textDim }),
      Text({ content: appState.selectedModel.toUpperCase(), fg: theme.textMuted }),
      processing ? Text({ content: " ●", fg: theme.warning }) : null
    ),
    // Input box
    Box(
      {
        flexDirection: "row",
        backgroundColor: theme.chatInputBg,
        height: 2,
      },
      Text({ content: "› ", fg: theme.secondary }),
      Input({
        id: "chat-input",
        width: "100%",
        backgroundColor: theme.chatInputBg,
        textColor: theme.text,
        placeholder: hasPermission ? "Use ↑↓ to select option, enter to confirm" : processing ? "Working..." : "Message",
      })
    )
  )
}

/**
 * Get risk level color
 */
function getRiskColor(riskLevel: string, theme: Theme): string {
  const colors: Record<string, string> = {
    LOW: theme.riskLow,
    MEDIUM: theme.riskMedium,
    HIGH: theme.riskHigh,
    CRITICAL: theme.riskCritical,
  }
  return colors[riskLevel] || theme.textDim
}

/**
 * Format tool arguments for display
 */
function formatArguments(args: Record<string, unknown>, maxPairs = 3): string {
  if (!args || Object.keys(args).length === 0) return ""
  const entries = Object.entries(args).slice(0, maxPairs)
  const parts = entries.map(([key, value]) => `${key}: ${formatArgValue(value)}`)
  const suffix = Object.keys(args).length > maxPairs ? ", ..." : ""
  return parts.join(", ") + suffix
}

function formatArgValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") {
    const trimmed = value.length > 40 ? value.slice(0, 40) + "..." : value
    return `"${trimmed}"`
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    const preview = value.slice(0, 3).map(v => formatArgValue(v)).join(", ")
    return `[${preview}${value.length > 3 ? ", ..." : ""}]`
  }
  try {
    const str = JSON.stringify(value)
    return str && str.length > 40 ? str.slice(0, 40) + "..." : str
  } catch {
    return String(value)
  }
}

function formatToolName(toolName: string): string {
  const map: Record<string, string> = {
    read_file: "Read",
    list_files: "List",
    grep: "Search",
    web_search: "Search",
    search_and_replace: "Replace",
    bash: "Bash",
  }
  if (map[toolName]) return map[toolName]
  return toolName
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatToolCallLine(toolName: string, args?: Record<string, unknown>): string {
  const label = formatToolName(toolName)
  const argText = args ? formatArguments(args, 4) : ""
  return argText ? `${label}(${argText})` : label
}


/**
 * Count lines in output
 */
function countLines(str: string): number {
  return str.split("\n").length
}

/**
 * Create a message view
 */
function createMessageView(msg: AgentMessage, theme: Theme): VNode {
  switch (msg.type) {
    case "user":
      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1, flexDirection: "row", backgroundColor: theme.userMsgBg },
        Text({ content: "❱ ", fg: theme.userMsgText }),
        Text({ content: msg.content, fg: theme.userMsgText })
      )

    case "assistant":
      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1, flexDirection: "column" },
        Text({ content: msg.content, fg: theme.text })
      )

    case "tool_call": {
      const tc = msg as ToolCallMessage
      const color = tc.status === "running"
        ? theme.toolRunning
        : tc.status === "complete"
          ? theme.toolComplete
          : theme.toolError
      const icon = tc.status === "error" ? "?" : "?"
      const isExpanded = appState.expandedToolCalls.has(tc.id)

      // Build output preview
      let fullOutput = ""
      if (tc.result) {
        const result = tc.result as Record<string, unknown>
        if (result.success === false) {
          isError = true
          fullOutput = String(result.error || "Failed")
        } else if (result.output && typeof result.output === "string") {
          fullOutput = result.output
        } else if (result.stdout && typeof result.stdout === "string") {
          fullOutput = result.stdout
          if (result.stderr && typeof result.stderr === "string") {
            fullOutput += fullOutput ? "\n" + result.stderr : result.stderr
          }
        } else if (result.result && typeof result.result === "string") {
          fullOutput = result.result
        } else {
          fullOutput = JSON.stringify(result, null, 2)
        }
      }

      const hasMoreContent = fullOutput.length > 80 || countLines(fullOutput) > 1

      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1, flexDirection: "column" },
        // Header row
        Box(
          { flexDirection: "row", gap: 1 },
          Text({ content: icon, fg: color }),
          Text({ content: formatToolCallLine(tc.toolName, tc.arguments), fg: theme.primary })
        ),
        // Expand hint
        !isExpanded && hasMoreContent
          ? Text({ content: `  [${countLines(fullOutput)} lines, press Ctrl+O to expand]`, fg: theme.textDim })
          : null,
        // Expanded content
        isExpanded && fullOutput
          ? Box(
              { flexDirection: "column", paddingX: 2, paddingY: 1, backgroundColor: theme.backgroundDark },
              ...fullOutput.split("\n").slice(0, 50).map((line, idx) => {
                const lineIsError = line.toLowerCase().includes("error") || line.toLowerCase().includes("failed") || line.toLowerCase().includes("warning")
                return Text({
                  content: line || " ",
                  fg: lineIsError ? theme.error : theme.textMuted,
                })
              }),
              fullOutput.split("\n").length > 50
                ? Text({ content: `... (${fullOutput.split("\n").length - 50} more lines)`, fg: theme.textDim })
                : null
            )
          : null
      )
    }

    case "tool_result": {
      const resultMsg = msg as import("./types").ToolResultMessage
      const color = resultMsg.success ? theme.textDim : theme.error
      const prefix = resultMsg.success ? "  " : "  ? "
      return Box(
        { paddingLeft: 4, paddingRight: 2, marginBottom: 1, flexDirection: "column" },
        Text({ content: `${prefix}${resultMsg.summary}`, fg: color })
      )
    }

    case "error":
      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1 },
        Text({ content: `✗ ${msg.content}`, fg: theme.error })
      )

    case "thinking":
      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1 },
        Text({ content: (msg as import("./types").ThinkingMessage).content, fg: theme.textDim })
      )

    case "permission": {
      const pm = msg as PermissionMessage
      const riskColor = getRiskColor(pm.riskLevel, theme)
      // Check if this is the currently pending permission by reference
      const isSelected = appState.agentState.pendingPermission?.id === pm.id

      return Box(
        { paddingLeft: 2, paddingRight: 2, marginBottom: 1, flexDirection: "column" },
        // Permission header
        Box(
          { flexDirection: "column" },
          Text({ content: `Allow ${pm.toolName}?`, fg: riskColor }),
          pm.arguments && Object.keys(pm.arguments).length > 0
            ? Text({ content: formatArguments(pm.arguments), fg: theme.textDim })
            : null,
          Text({ content: `Risk: ${pm.riskLevel}`, fg: riskColor })
        ),
        // Permission options
        Box(
          { flexDirection: "column", marginTop: 1 },
          ...pm.options.map((opt, idx) => {
            const isOptionSelected = isSelected && idx === pm.selectedIndex
            const isCustom = opt.type === "custom"

            return Box(
              {
                flexDirection: "column",
                paddingLeft: 1,
                backgroundColor: isOptionSelected ? theme.backgroundLight : "transparent",
              },
              Box(
                { flexDirection: "row", gap: 1 },
                Text({ content: isOptionSelected ? "❯" : " ", fg: theme.accent }),
                Text({ content: `${idx + 1}.`, fg: theme.textDim }),
                Text({ content: opt.label, fg: isOptionSelected ? theme.text : theme.textMuted })
              ),
              opt.description && !isCustom
                ? Text({ content: `   ${opt.description}`, fg: theme.textDim })
                : null
            )
          })
        ),
        // Footer hint
        isSelected
          ? Text({ content: "↑↓ select, enter to confirm, esc to deny", fg: theme.textDim })
          : null
      )
    }

    default:
      return Box({})
  }
}

/**
 * Focus the chat input
 */
export function focusChatInput() {
  if (chatInputElement) {
    chatInputElement.focus()
  }
}

export function scrollToBottom() {
  if (scrollBoxElement) {
    scrollBoxElement.scrollTo({ x: 0, y: scrollBoxElement.scrollHeight })
  }
}
