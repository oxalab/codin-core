/**
 * Keyboard Handling
 * Global keyboard shortcuts using core API
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"
import { appState, triggerRebuild } from "./state"
import {
  handleTabNavigation,
  handleEnterOnTab,
  handleEscape,
} from "./prompt-screen"
import { closeOverlay, getOverlayElements } from "./overlays"
import { getPermissionResolver } from "./agent-binding"
import { PermissionDecision } from "../src/types/permissions"
import { filterCommands } from "./app"

let renderer: CliRenderer | null = null
let scrollBoxElement: any = null

// Command palette focus tracking
let commandPaletteInput: any = null
let commandPaletteSelect: any = null

export function setCommandPaletteElements(inputEl: any, selectEl: any) {
  commandPaletteInput = inputEl
  commandPaletteSelect = selectEl
}

export function setupKeyboard(r: CliRenderer) {
  renderer = r

  r.keyInput.on("keypress", (key: KeyEvent) => {
    handleKey(key)
  })

  // Intercept hitTest to return ScrollBox for scroll events in chat screen
  // This is needed because hitTest returns the innermost element (Text/Box)
  // but scroll events should go to the ScrollBox parent
  const originalHitTest = (r as any).hitTest.bind(r)
  ;(r as any).hitTest = function(x: number, y: number): number {
    // For scroll events on chat screen, return the ScrollBox
    if (appState.screen === "chat" && scrollBoxElement) {
      // Check if the point is within the ScrollBox's bounds
      const sb = scrollBoxElement
      if (x >= sb.x && x < sb.x + sb.width && y >= sb.y && y < sb.y + sb.height) {
        return sb.num
      }
    }
    return originalHitTest(x, y)
  }
}

// Export function to set scroll box reference
export function setScrollBoxElement(el: any) {
  scrollBoxElement = el
}

function handleKey(key: KeyEvent) {
  // Command palette (Ctrl+P)
  if (key.ctrl && key.name === "p") {
    appState.commandPaletteOpen = !appState.commandPaletteOpen
    if (appState.commandPaletteOpen) {
      // Reset state when opening
      appState.commandPaletteQuery = ""
      appState.commandPaletteSelectedIndex = 0
      appState.filteredCommands = []
    }
    triggerRebuild()
    return
  }

  // Close command palette with Escape
  if (appState.commandPaletteOpen && key.name === "escape") {
    appState.commandPaletteOpen = false
    appState.commandPaletteQuery = ""
    appState.commandPaletteSelectedIndex = 0
    appState.filteredCommands = []
    triggerRebuild()
    return
  }

  // Command palette navigation: Up/Down between input and select
  if (appState.commandPaletteOpen) {
    // Down arrow: move from input to select
    if ((key.name === "down" || key.name === "j") && commandPaletteInput && commandPaletteSelect) {
      // Check if input is focused by trying to move focus to select
      if (commandPaletteSelect) {
        commandPaletteSelect.focus?.()
        return
      }
    }
    // Up arrow at top of select: move back to input
    if ((key.name === "up" || key.name === "k") && commandPaletteSelect && commandPaletteInput) {
      // Check if select is at index 0
      const selectIndex = commandPaletteSelect.getSelectedIndex?.() ?? commandPaletteSelect.selectedIndex
      if (selectIndex === 0) {
        commandPaletteInput.focus?.()
        return
      }
    }
  }

  // Prompt screen
  if (appState.screen === "prompt") {
    handlePromptKeys(key)
    return
  }

  // Chat screen
  if (appState.screen === "chat") {
    handleChatKeys(key)
    return
  }
}

function handlePromptKeys(key: KeyEvent) {
  // Overlay navigation - same pattern as command palette
  if (appState.overlayOpen) {
    // Close with Escape
    if (key.name === "escape") {
      handleEscape()
      return
    }

    // Get overlay elements
    const { input: overlayInput, select: overlaySelect } = getOverlayElements()

    // Down arrow: move from input to select
    if ((key.name === "down" || key.name === "j") && overlayInput && overlaySelect) {
      overlaySelect.focus?.()
      return
    }

    // Up arrow at top of select: move back to input
    if ((key.name === "up" || key.name === "k") && overlaySelect && overlayInput) {
      const selectIndex = overlaySelect.getSelectedIndex?.() ?? overlaySelect.selectedIndex
      if (selectIndex === 0) {
        overlayInput.focus?.()
        return
      }
    }

    // Enter to confirm - handled by the components themselves
    return
  }

  // Tab - navigate between input and tabs
  if (key.name === "tab") {
    handleTabNavigation()
    return
  }

  // Enter when on tab (not input) - open overlay
  if ((key.name === "return" || key.name === "enter") && !appState.inputFocused && !appState.overlayOpen) {
    handleEnterOnTab()
    return
  }

  // Escape - close overlay or return to input
  if (key.name === "escape") {
    handleEscape()
    return
  }
}

function handleChatKeys(key: KeyEvent) {
  // Permission inline navigation (highest priority)
  if (appState.agentState.pendingPermission) {
    const permission = appState.agentState.pendingPermission
    const resolver = getPermissionResolver()

    if (key.name === "up" || key.name === "k") {
      if (permission.selectedIndex > 0) {
        permission.selectedIndex--
        triggerRebuild()
      }
      return
    }
    if (key.name === "down" || key.name === "j") {
      if (permission.selectedIndex < permission.options.length - 1) {
        permission.selectedIndex++
        triggerRebuild()
      }
      return
    }
    if (key.name === "return" || key.name === "enter") {
      const selected = permission.options[permission.selectedIndex]
      if (selected && resolver) {
        // Call the permission resolver to continue the agent loop
        switch (selected.type) {
          case "allow_once":
            resolver(PermissionDecision.ALLOW, "Allowed once")
            break
          case "allow_session":
            resolver(PermissionDecision.ALLOW, "Allowed for session")
            break
          case "custom":
            // For custom, we deny and let the user type a custom message
            appState.agentState.pendingPermission = null
            triggerRebuild()
            break
        }
      }
      return
    }
    if (key.name === "escape") {
      if (resolver) {
        resolver(PermissionDecision.DENY, "Cancelled by user")
      } else {
        appState.agentState.pendingPermission = null
        triggerRebuild()
      }
      return
    }
    // Also handle number keys 1-9 for quick selection
    if (key.name >= "1" && key.name <= "9") {
      const idx = parseInt(key.name) - 1
      if (idx < permission.options.length) {
        permission.selectedIndex = idx
        const selected = permission.options[idx]
        if (selected && resolver) {
          switch (selected.type) {
            case "allow_once":
              resolver(PermissionDecision.ALLOW, "Allowed once")
              break
            case "allow_session":
              resolver(PermissionDecision.ALLOW, "Allowed for session")
              break
            case "custom":
              appState.agentState.pendingPermission = null
              triggerRebuild()
              break
          }
        }
      }
      return
    }
    return
  }

  // Ctrl+B - toggle sidebar
  if (key.ctrl && key.name === "b") {
    appState.sidebarOpen = !appState.sidebarOpen
    triggerRebuild()
    return
  }

  // Ctrl+O - expand/collapse tool calls
  if (key.ctrl && key.name === "o") {
    const messages = appState.agentState.messages
    const toolCalls = messages.filter(m => m.type === "tool_call")
    if (toolCalls.length > 0) {
      const last = toolCalls[toolCalls.length - 1]
      if (appState.expandedToolCalls.has(last.id)) {
        appState.expandedToolCalls.delete(last.id)
      } else {
        appState.expandedToolCalls.add(last.id)
      }
      triggerRebuild()
    }
    return
  }

  // Escape - close sidebar / collapse tools
  if (key.name === "escape") {
    if (appState.sidebarOpen) {
      appState.sidebarOpen = false
      triggerRebuild()
    } else if (appState.expandedToolCalls.size > 0) {
      appState.expandedToolCalls.clear()
      triggerRebuild()
    }
    return
  }
}
