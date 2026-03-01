/**
 * Application State
 * Reactive state management without React hooks
 */

import type { CliRenderer } from "@opentui/core"
import type {
  Screen,
  AgentState,
  AgentMessage,
  CommandOption,
} from "./types"
import { getTheme, type Theme } from "./themes"

// Global renderer reference
export let renderer: CliRenderer | null = null

export function setRenderer(r: CliRenderer) {
  renderer = r
}

// Application state
export const appState = {
  // Screen state
  screen: "prompt" as Screen,

  // Theme state
  currentThemeId: "default",
  get currentTheme(): Theme {
    return getTheme(this.currentThemeId)
  },

  // Prompt state
  promptText: "",
  activeTabIndex: 0,
  inputFocused: true,
  overlayOpen: false,

  // Overlay selection state
  overlaySearchQuery: "",
  overlaySelectedIndex: 0,

  // Permission overlay state
  permissionCustomInput: "",
  permissionSelectedOptionIndex: 0,
  
  // Chat state
  chatInput: "",
  selectedMode: "Chat",
  selectedModel: "gpt-4o",
  sidebarOpen: false,
  expandedToolCalls: new Set<string>(),
  
  // Command palette
  commandPaletteOpen: false,
  commandPaletteQuery: "",
  commandPaletteSelectedIndex: 0,
  filteredCommands: [] as CommandOption[],
  
  // Agent state
  agentState: {
    isProcessing: false,
    messages: [] as AgentMessage[],
    pendingPermission: null,
  } as AgentState,
  
  // Initialization state
  isInitializing: true,
  initStatus: "Initializing...",
  initError: null as string | null,
  usingMinimalTools: false,
  orchestrator: null as unknown,
  
  // Toast
  toastMessage: null as string | null,
  toastType: "info" as "error" | "warning" | "info" | "success",
  
  // Dynamic options
  modelOptions: [
    { name: "gpt-4o", description: "Balanced, fast" },
    { name: "gpt-4.1", description: "Reasoning-focused" },
    { name: "gpt-4o-mini", description: "Lightweight" },
  ],
  
  // Commands
  commands: [] as CommandOption[],
}

// State update callback
let onStateChange: (() => void) | null = null

export function setStateChangeCallback(cb: () => void) {
  onStateChange = cb
}

export function triggerRebuild() {
  if (onStateChange) {
    onStateChange()
  }
}

// Helper to update state and trigger rebuild
export function updateState(updates: Partial<typeof appState>) {
  Object.assign(appState, updates)
  triggerRebuild()
}

// Message ID counter
let messageIdCounter = 0

export function generateMessageId(): string {
  return `msg_${Date.now()}_${messageIdCounter++}`
}

/**
 * Set the current theme
 */
export function setTheme(themeId: string): void {
  appState.currentThemeId = themeId
  triggerRebuild()
}

/**
 * Get the current theme
 */
export function getCurrentTheme(): Theme {
  return appState.currentTheme
}
