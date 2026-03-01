/**
 * Agent Binding
 * Connects the agent orchestrator to the TUI state
 */

import { appState, updateState, triggerRebuild, generateMessageId } from "./state"
import type { AgentMessage, PermissionMessage, PermissionResponse, ToolCallMessage } from "./types"
import { scrollToBottom } from "./chat-screen"
import { PermissionDecision } from "../src/types/permissions"
import { AgentOrchestrator } from "../src/agent/orchestrator"
import { ToolSchemaLoader } from "../src/runtime/tool-schema"
import { PromptLoader } from "../src/runtime/prompt"
import { ConfigLoader } from "../src/runtime/config"
import { getModelsService } from "../src/runtime/models"

let permissionResolver: ((decision: PermissionDecision, reason: string) => void) | null = null

// Track the current tool call being executed for result updates
let currentToolCallId: string | null = null

/**
 * Get the current permission resolver (for keyboard handler)
 */
export function getPermissionResolver() {
  return permissionResolver
}

/**
 * Initialize the agent orchestrator
 */
export async function initializeAgentOrchestrator(): Promise<void> {
  const configLoader = new ConfigLoader()
  const llmConfig = await configLoader.getLLMConfig()
  const workingDirectory = await configLoader.getWorkingDirectory()

  // Load models
  try {
    const modelsService = getModelsService()
    const models = await modelsService.getModels(String(llmConfig.provider), llmConfig.api_key)
    appState.modelOptions = models.map(m => ({
      name: m.name,
      description: m.description,
    }))

    const currentModel = models.find(m => m.id === llmConfig.model || m.name === llmConfig.model)
    if (currentModel) {
      appState.selectedModel = currentModel.name
    }
  } catch {
    // Use defaults
  }

  // Check minimal tools
  const useMinimalTools = await configLoader.useMinimalTools()
  appState.usingMinimalTools = useMinimalTools

  // Load prompt
  const promptLoader = new PromptLoader()
  if (useMinimalTools) {
    promptLoader.setMinimalMode(true)
  }
  await promptLoader.init()
  const systemPrompt = await promptLoader.buildFullPrompt()

  // Load tools
  const toolSchemaLoader = new ToolSchemaLoader()
  const tools = await toolSchemaLoader.formatForLLM(useMinimalTools)

  // Create orchestrator
  const orchestrator = new AgentOrchestrator(
    llmConfig,
    workingDirectory,
    systemPrompt,
    tools,
    true,
    true,
    true
  )

  appState.orchestrator = orchestrator

  // Set up callbacks
  setupCallbacks(orchestrator)
}

/**
 * Set up orchestrator callbacks
 */
function setupCallbacks(orchestrator: AgentOrchestrator) {
  // Message callback
  orchestrator.setMessageCallback((message: unknown) => {
    const msg = message as { role?: string; content?: string }

    if (msg.role === "user") {
      const userMsg: AgentMessage = {
        id: generateMessageId(),
        type: "user",
        content: msg.content || "",
        timestamp: Date.now(),
      }
      appState.agentState.messages.push(userMsg)
      triggerRebuild()
      setTimeout(() => scrollToBottom(), 100)
      return
    }

    if (msg.role === "assistant") {
      const assistantMsg: AgentMessage = {
        id: generateMessageId(),
        type: "assistant",
        content: msg.content || "",
        timestamp: Date.now(),
      }
      appState.agentState.messages.push(assistantMsg)
      triggerRebuild()
      setTimeout(() => scrollToBottom(), 100)
    }
  })

  // Tool call callback
  orchestrator.setToolCallCallback((toolName: string, args: Record<string, unknown>) => {
    const msgId = generateMessageId()
    currentToolCallId = msgId

    const toolMsg: AgentMessage = {
      id: msgId,
      type: "tool_call",
      toolName,
      status: "running",
      summary: `Running ${toolName}...`,
      arguments: args,
      timestamp: Date.now(),
    }
    appState.agentState.messages.push(toolMsg)
    triggerRebuild()
    setTimeout(() => scrollToBottom(), 100)
  })

  // Tool result callback
  orchestrator.setToolResultCallback((result: unknown) => {
    const res = result as {
      tool_name?: string
      success?: boolean
      result?: unknown
      output?: string
      error?: string
    }

    const summaryText = formatToolSummary(res)

    // Update the tool call message with result
    if (currentToolCallId) {
      const toolCallMsg = appState.agentState.messages.find(
        m => m.id === currentToolCallId && m.type === "tool_call"
      ) as ToolCallMessage | undefined

      if (toolCallMsg) {
        toolCallMsg.status = res.success ? "complete" : "error"

        // Create result object
        const toolResult = {
          success: res.success || false,
          output: res.output || (typeof res.result === "string" ? res.result : undefined),
          error: res.error,
        }

        // Add structured output if available
        if (res.result && typeof res.result === "object") {
          toolCallMsg.result = res.result as Record<string, unknown>
        } else {
          toolCallMsg.result = toolResult
        }

        toolCallMsg.summary = summaryText
      }

      currentToolCallId = null
    }

    // Add a summary message
    const summaryMsg: AgentMessage = {
      id: generateMessageId(),
      type: "tool_result",
      toolName: res.tool_name || "unknown",
      content: summaryText,
      summary: summaryText,
      success: res.success || false,
      timestamp: Date.now(),
    }
    appState.agentState.messages.push(summaryMsg)
    triggerRebuild()
    setTimeout(() => scrollToBottom(), 100)
  })

  // Approval callback
  orchestrator.setApprovalCallback((request: unknown) => {
    return new Promise<PermissionDecision>((resolve) => {
      const req = request as {
        tool_name: string
        arguments: Record<string, unknown>
        risk_level: string
      }

      const permissionMsg: PermissionMessage = {
        id: generateMessageId(),
        type: "permission",
        toolName: req.tool_name,
        arguments: req.arguments,
        riskLevel: req.risk_level,
        options: [
          { id: "1", label: "Yes", description: "Allow once", type: "allow_once" },
          { id: "2", label: "Yes, don't ask again", description: "Allow for session", type: "allow_session" },
          { id: "3", label: "No, tell me what to do", description: "Custom response", type: "custom" },
        ],
        selectedIndex: 0,
        timestamp: Date.now(),
      }

      appState.agentState.pendingPermission = permissionMsg
      appState.agentState.isProcessing = false
      triggerRebuild()
      setTimeout(() => scrollToBottom(), 100)

      permissionResolver = (decision, reason) => {
        resolve(decision)
        appState.agentState.pendingPermission = null
        appState.agentState.isProcessing = decision !== PermissionDecision.DENY

        // Add resolution message
        const resolutionMsg: AgentMessage = {
          id: generateMessageId(),
          type: "thinking",
          content: decision === PermissionDecision.ALLOW ? `✓ ${reason}` : `✗ ${reason}`,
          complete: true,
          timestamp: Date.now(),
        }
        appState.agentState.messages.push(resolutionMsg)
        triggerRebuild()
        setTimeout(() => scrollToBottom(), 100)
      }
    })
  })
}

/**
 * Process user input through the agent
 */
export async function processUserInput(input: string): Promise<void> {
  const orchestrator = appState.orchestrator as AgentOrchestrator | null
  if (!orchestrator) return

  appState.agentState.isProcessing = true
  appState.agentState.pendingPermission = null
  triggerRebuild()

  try {
    await orchestrator.processUserInput(input)
  } catch (err: unknown) {
    const errorMsg: AgentMessage = {
      id: generateMessageId(),
      type: "error",
      content: `Error: ${(err as Error).message}`,
      timestamp: Date.now(),
    }
    appState.agentState.messages.push(errorMsg)
  }

  appState.agentState.isProcessing = false
  currentToolCallId = null
  triggerRebuild()
  setTimeout(() => scrollToBottom(), 100)
}

/**
 * Handle permission response from UI
 */
export function handlePermissionResponse(response: PermissionResponse): void {
  const orchestrator = appState.orchestrator as AgentOrchestrator | null
  if (!orchestrator || !permissionResolver) return

  const pending = appState.agentState.pendingPermission
  if (!pending) return

  switch (response.type) {
    case "allow_session": {
      let host: string | null = null
      if (pending.toolName === "bash" && pending.arguments?.command) {
        host = orchestrator.permissionEngine.extractHostFromCommand(
          String(pending.arguments.command)
        )
      }
      orchestrator.permissionEngine.addSessionAllowRule(
        pending.toolName,
        host || undefined
      )
      const hostText = host ? ` on ${host}` : ""
      permissionResolver(PermissionDecision.ALLOW, `Allowed for session${hostText}`)
      break
    }
    case "allow_once":
      permissionResolver(PermissionDecision.ALLOW, "Allowed once")
      break
    case "deny":
      permissionResolver(PermissionDecision.DENY, "Denied by user")
      break
    case "custom":
      if (response.customResponse) {
        orchestrator.injectUserMessage(response.customResponse)
        permissionResolver(PermissionDecision.DENY, "User provided alternative")
      } else {
        permissionResolver(PermissionDecision.DENY, "User declined")
      }
      break
  }
}

/**
 * Format tool result summary
 */
function formatToolSummary(result: {
  tool_name?: string
  success?: boolean
  result?: unknown
  error?: string
  output?: string
}): string {
  if (!result.success) {
    return `x ${result.error || "Failed"}`
  }

  const toolName = result.tool_name || ""
  const payload = result.result && typeof result.result === "object"
    ? result.result as Record<string, unknown>
    : null

  switch (toolName) {
    case "read_file": {
      const content = payload?.content
      if (typeof content === "string") {
        const lines = content.length === 0 ? 0 : content.split("\n").length
        return `Read ${lines} line${lines === 1 ? "" : "s"}`
      }
      return "Read file"
    }
    case "grep": {
      const count = payload?.count
      if (typeof count === "number") {
        const truncated = payload?.truncated ? " (truncated)" : ""
        return `Found ${count} line${count === 1 ? "" : "s"}${truncated} (ctrl+o to expand)`
      }
      return "Search complete"
    }
    case "list_files": {
      const count = payload?.count
      if (typeof count === "number") {
        return `Found ${count} file${count === 1 ? "" : "s"}`
      }
      return "Listed files"
    }
    case "web_search": {
      const count = payload?.count
      if (typeof count === "number") {
        return `Found ${count} result${count === 1 ? "" : "s"} (ctrl+o to expand)`
      }
      return "Search complete"
    }
    case "search_and_replace": {
      const replacements = payload?.replacements
      if (typeof replacements === "number") {
        return `Replaced ${replacements} occurrence${replacements === 1 ? "" : "s"}`
      }
      return "Replace complete"
    }
    case "bash": {
      const output = result.output || (typeof result.result === "string" ? result.result : "")
      if (output) {
        const firstLine = String(output).split("\n")[0]
        return firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine
      }
      return "Command executed"
    }
    default:
      return toolName || "Done"
  }
}

