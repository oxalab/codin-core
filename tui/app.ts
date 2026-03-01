/**
 * Main Application
 * Built with @opentui/core constructs (no React)
 */

import {
  Box,
  Text,
  Select,
  Input,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  type CliRenderer,
  type VNode,
  type BoxRenderable,
  type RootRenderable,
} from "@opentui/core"
import { cwd } from "node:process"

import { appState, triggerRebuild, setRenderer, setStateChangeCallback, setTheme, renderer as rendererRef } from "./state"
import { mascot, heading } from "./assets/content"
import { initializeAgentOrchestrator } from "./agent-binding"
import { setupKeyboard, setCommandPaletteElements } from "./keyboard"
import { createPromptScreen } from "./prompt-screen"
import { createChatScreen } from "./chat-screen"
import { createModeSelectionOverlay, createModelSelectionOverlay } from "./overlays"
import { themes } from "./themes"

// Store reference to content root
let contentRoot: RootRenderable | null = null

// Command palette component references
let commandPaletteInput: InputRenderable | null = null
let commandPaletteSelect: SelectRenderable | null = null
let commandPaletteSelectOptions: any[] = []

/**
 * Create the main application
 */
export function createApp(renderer: CliRenderer): VNode {
  setRenderer(renderer)
  setupKeyboard(renderer)
  setupCommands()

  const theme = appState.currentTheme

  const appRoot = Box(
    {
      id: "app-root",
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor: theme.background,
    },
    // Background (prompt screen only)
    createPromptBackground(),
    // Main content area
    Box(
      {
        id: "main-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
      },
      // Dynamic screen content
      Box({ id: "screen-container", width: "100%", flexGrow: 1 }),
      // Footer
      Box({ id: "footer-container", width: "100%", height: 1 })
    ),
    // Overlay layer
    Box({ id: "overlay-container", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }),
    // Toast layer
    Box({ id: "toast-container", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })
  )

  contentRoot = renderer.root
  setStateChangeCallback(rebuildUI)

  return appRoot
}

/**
 * Rebuild UI based on current state
 */
export function rebuildUI() {
  if (!contentRoot) return

  const theme = appState.currentTheme

  // Update renderer's background color (this controls the actual terminal background)
  if (rendererRef?.setBackgroundColor) {
    rendererRef.setBackgroundColor(theme.background)
  }

  // Update contentRoot background color directly (contentRoot IS the app-root)
  const root = contentRoot as any
  root.backgroundColor = theme.background
  if (root.props) {
    root.props.backgroundColor = theme.background
  }

  // Update prompt-background backgroundColor directly on existing renderable
  const bg = contentRoot.findDescendantById("prompt-background") as BoxRenderable | null
  if (bg) {
    // Update background color on the renderable element
    ;(bg as any).backgroundColor = theme.background
    // Request a re-render of this element
    ;(bg as any).requestRender()
    // Update visibility
    bg.visible = appState.screen === "prompt"

    // Update heading and mascot text colors
    const headingText = bg.findDescendantById("heading-text")
    if (headingText) {
      ;(headingText as any).fg = theme.textMuted
      ;(headingText as any).requestRender()
    }

    const mascotText = bg.findDescendantById("mascot-text")
    if (mascotText) {
      ;(mascotText as any).fg = theme.textDim
      ;(mascotText as any).requestRender()
    }
  }

  // Also update the contentRoot (app-root) background
  ;(contentRoot as any).backgroundColor = theme.background
  if ((contentRoot as any).requestRender) {
    ;(contentRoot as any).requestRender()
  }

  // Screen container
  const screenContainer = contentRoot.findDescendantById("screen-container") as BoxRenderable | null
  if (screenContainer) {
    clearContainer(screenContainer)

    if (appState.screen === "prompt") {
      screenContainer.add(createPromptScreen(contentRoot))
    } else {
      screenContainer.add(createChatScreen(contentRoot))
    }
  }

  // Overlay container
  const overlayContainer = contentRoot.findDescendantById("overlay-container") as BoxRenderable | null
  if (overlayContainer) {
    clearContainer(overlayContainer)

    if (appState.overlayOpen && appState.screen === "prompt") {
      if (appState.activeTabIndex === 0) {
        overlayContainer.add(createModeSelectionOverlay(contentRoot))
      } else {
        overlayContainer.add(createModelSelectionOverlay(contentRoot))
      }
    }

    if (appState.sidebarOpen && appState.screen === "chat") {
      overlayContainer.add(createSidebar())
    }

    if (appState.commandPaletteOpen) {
      overlayContainer.add(createCommandPalette())
    }
  }

  // Toast container
  const toastContainer = contentRoot.findDescendantById("toast-container") as BoxRenderable | null
  if (toastContainer) {
    clearContainer(toastContainer)

    if (appState.initError) {
      toastContainer.add(createToast(appState.initError, "error"))
    }

    if (appState.toastMessage) {
      toastContainer.add(createToast(appState.toastMessage, appState.toastType))
    }
  }

  // Footer
  const footerContainer = contentRoot.findDescendantById("footer-container") as BoxRenderable | null
  if (footerContainer) {
    clearContainer(footerContainer)
    footerContainer.add(createFooter())
  }
}

function clearContainer(container: BoxRenderable) {
  const children = container.getChildren()
  for (const child of children) {
    container.remove(child.id)
  }
}

/**
 * Create prompt background
 */
function createPromptBackground(): VNode {
  const theme = appState.currentTheme

  return Box(
    {
      id: "prompt-background",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: theme.background,
    },
    Box(
      {
        position: "absolute",
        top: 1,
        left: 0,
        width: "100%",
        height: 6,
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ id: "heading-text", content: heading, fg: theme.textMuted })
    ),
    Box(
      {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        padding: 1,
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ id: "mascot-text", content: mascot, fg: theme.textDim })
    )
  )
}

/**
 * Create footer
 */
function createFooter(): VNode {
  const theme = appState.currentTheme
  if (appState.screen === "prompt") {
    return Box(
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.background,
      },
      Text({ content: `cwd: ${cwd()}`, fg: theme.textMuted }),
      appState.isInitializing
        ? Text({ content: appState.initStatus, fg: theme.warning })
        : appState.orchestrator
          ? Text({ content: "Ready", fg: theme.success })
          : Text({ content: "Init failed", fg: theme.error }),
      Text({ content: "Tab: switch", fg: theme.textDim })
    )
  }

  return Box(
    {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.background,
    },
    Text({ content: "ctrl+p: palette", fg: theme.textMuted }),
    Text({ content: "ctrl+b: sidebar", fg: theme.textMuted }),
    Text({ content: theme.name, fg: theme.primary })
  )
}

/**
 * Create sidebar
 */
function createSidebar(): VNode {
  const theme = appState.currentTheme
  return Box(
    {
      position: "absolute",
      top: 1,
      right: 1,
      width: 30,
      height: "70%",
      border: true,
      borderStyle: "rounded",
      backgroundColor: theme.sidebarBg,
      padding: 1,
      flexDirection: "column",
      gap: 1,
    },
    Text({ content: "Sidebar", fg: theme.textMuted }),
    Text({ content: `cwd: ${cwd()}`, fg: theme.textDim })
  )
}

/**
 * Create command palette
 * Uses Select component with fixed height for scrollable command list
 */
function createCommandPalette(): VNode {
  const theme = appState.currentTheme
  const filteredCommands = appState.filteredCommands.length > 0
    ? appState.filteredCommands
    : appState.commands

  // Convert commands to Select options format
  const selectOptions = filteredCommands.map(cmd => ({
    name: cmd.label,
    description: cmd.category ? `${cmd.category}: ${cmd.description}` : cmd.description,
    // Store the original command for execution
    _command: cmd,
  }))

  // Store options for later updates
  commandPaletteSelectOptions = selectOptions

  // Set up event handlers after render
  setTimeout(() => {
    if (!contentRoot) return

    const input = contentRoot.findDescendantById("command-palette-input") as InputRenderable | null
    const select = contentRoot.findDescendantById("command-palette-select") as SelectRenderable | null

    if (input) {
      commandPaletteInput = input
      input.focus()
      input.value = appState.commandPaletteQuery

      // Handle input changes - update select options directly in real-time
      input.on(InputRenderableEvents.CHANGE, (value: string) => {
        appState.commandPaletteQuery = value
        filterCommands(value)

        // Update select options directly for real-time filtering (use local select variable)
        if (select) {
          const newOptions = (appState.filteredCommands.length > 0
            ? appState.filteredCommands
            : appState.commands
          ).map(cmd => ({
            name: cmd.label,
            description: cmd.category ? `${cmd.category}: ${cmd.description}` : cmd.description,
            _command: cmd,
          }))

          // Update the select's options property directly
          select.options = newOptions
          commandPaletteSelectOptions = newOptions
          select.selectedIndex = 0
          appState.commandPaletteSelectedIndex = 0
        }
      })

      // Handle Enter key on input - execute selected command if valid
      input.on(InputRenderableEvents.ENTER, () => {
        const currentCommands = appState.filteredCommands.length > 0
          ? appState.filteredCommands
          : appState.commands

        // Only execute if there are matching commands
        if (currentCommands.length > 0 && appState.commandPaletteSelectedIndex < currentCommands.length) {
          const cmd = currentCommands[appState.commandPaletteSelectedIndex]
          if (cmd && cmd.action) {
            appState.commandPaletteOpen = false
            appState.commandPaletteQuery = ""
            appState.commandPaletteSelectedIndex = 0
            appState.filteredCommands = []
            cmd.action()
          }
        }
        // If no matches, keep palette open
      })
    }

    if (select) {
      commandPaletteSelect = select
      select.selectedIndex = Math.min(appState.commandPaletteSelectedIndex, selectOptions.length - 1)

      // Handle Enter key - execute selected command
      select.on(SelectRenderableEvents.ITEM_SELECTED, (index: number, option: any) => {
        const cmd = option._command
        if (cmd && cmd.action) {
          appState.commandPaletteOpen = false
          appState.commandPaletteQuery = ""
          appState.commandPaletteSelectedIndex = 0
          appState.filteredCommands = []
          cmd.action()
        }
      })

      // Handle arrow key navigation - update selection index
      select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number, option: any) => {
        appState.commandPaletteSelectedIndex = index
      })
    }

    // Register elements with keyboard handler for navigation
    if (input && select) {
      setCommandPaletteElements(input, select)
    }
  }, 50)

  return Box(
    {
      id: "command-palette-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 3,
      backgroundColor: "#00000065"
    },
    Box(
      {
        id: "command-palette-box",
        width: 70,
        padding: 1,
        gap: 1,
        backgroundColor: theme.overlayBg,
        flexDirection: "column",
      },
      // Header
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 1,
        },
        Text({ content: "Command Palette", fg: theme.text }),
        Text({ content: `Theme: ${theme.name}`, fg: theme.primary })
      ),
      // Search input (for display only - type to filter then press tab to see results)
      Input({
        id: "command-palette-input",
        width: "100%",
        placeholder: "Type to filter, Tab to see results, Esc to close",
        backgroundColor: theme.backgroundDark,
        textColor: theme.text,
      }),
      // Commands list with fixed height and scroll
      Select({
        id: "command-palette-select",
        options: selectOptions,
        width: "100%",
        height: 12,
        selectedIndex: Math.min(appState.commandPaletteSelectedIndex, selectOptions.length - 1),
        selectedBackgroundColor: theme.backgroundLight,
        selectedTextColor: theme.text,
        showScrollIndicator: true,
      }),
      // Footer hint
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingTop: 1,
        },
        Text({ content: "↑↓ navigate, enter confirm, esc close", fg: theme.textDim }),
        Text({ content: `${filteredCommands.length} commands`, fg: theme.textDim })
      )
    )
  )
}

/**
 * Create toast
 */
function createToast(message: string, type: "error" | "warning" | "info" | "success"): VNode {
  const theme = appState.currentTheme
  const colors: Record<string, string> = {
    error: theme.error,
    warning: theme.warning,
    success: theme.success,
    info: theme.info,
  }

  return Box(
    {
      position: "absolute",
      bottom: 2,
      right: 2,
      backgroundColor: theme.backgroundDark,
    },
    Text({ content: message, fg: colors[type] })
  )
}

/**
 * Setup commands
 */
function setupCommands() {
  const themeCommands = Object.entries(themes).map(([id, theme]) => ({
    id: `theme-${id}`,
    label: theme.name,
    description: theme.description,
    category: "Themes",
    action: () => {
      setTheme(id)
      appState.toastMessage = `Theme changed to ${theme.name}`
      appState.toastType = "success"
      triggerRebuild()
    },
  }))

  appState.commands = [
    // Chat commands
    {
      id: "clear-chat",
      label: "Clear Chat",
      description: "Clear all messages",
      category: "Chat",
      action: () => {
        appState.screen = "prompt"
        appState.agentState.messages = []
        appState.toastMessage = "Chat cleared"
        appState.toastType = "info"
        triggerRebuild()
      },
    },
    // View commands
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      description: "Show or hide the sidebar",
      shortcut: "Ctrl+B",
      category: "View",
      action: () => {
        appState.sidebarOpen = !appState.sidebarOpen
        triggerRebuild()
      },
    },
    // Theme commands
    ...themeCommands,
  ]
}

/**
 * Filter commands based on query
 */
export function filterCommands(query: string): void {
  if (!query.trim()) {
    appState.filteredCommands = []
    appState.commandPaletteSelectedIndex = 0
    return
  }

  const lowerQuery = query.toLowerCase()
  appState.filteredCommands = appState.commands.filter(cmd =>
    cmd.label.toLowerCase().includes(lowerQuery) ||
    cmd.description?.toLowerCase().includes(lowerQuery) ||
    cmd.category?.toLowerCase().includes(lowerQuery)
  )
  appState.commandPaletteSelectedIndex = 0
}

/**
 * Initialize agent
 */
export async function initializeAgent(): Promise<void> {
  try {
    await initializeAgentOrchestrator()
    appState.isInitializing = false
    appState.initStatus = "Ready"
    appState.initError = null
    triggerRebuild()
  } catch (err: unknown) {
    appState.isInitializing = false
    appState.initStatus = "Failed"
    appState.initError = `Init failed: ${(err as Error).message}`
    triggerRebuild()
  }
}

export { appState }
