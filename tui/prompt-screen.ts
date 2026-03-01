/**
 * Prompt Screen Component
 * Clean, self-contained prompt interface with tab navigation
 *
 * Tab Navigation:
 * - Tab: Toggle between [Mode] and [Model] tabs
 * - Enter: Open selection overlay for current tab
 * - Esc: Close overlay / return to input
 */

import {
  Box,
  Text,
  Input,
  Select,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderableEvents,
  type VNode,
  type BoxRenderable,
  type RootRenderable,
} from "@opentui/core"
import { appState, triggerRebuild } from "./state"
import type { TabOption } from "./types"
import { modeOptions } from "./config/options"
import { processUserInput } from "./agent-binding"

let promptInputElement: InputRenderable | null = null

/**
 * Create the prompt screen
 */
export function createPromptScreen(contentRoot: RootRenderable | BoxRenderable | null): VNode {
  const theme = appState.currentTheme

  // Set up input handler after render
  setTimeout(() => {
    if (!contentRoot) return

    const input = contentRoot.findDescendantById("prompt-input") as InputRenderable | null
    if (input) {
      promptInputElement = input
      input.focus()

      input.on(InputRenderableEvents.ENTER, (value: string) => {
        if (value.trim() && !appState.isInitializing && appState.orchestrator) {
          // Store prompt and switch to chat
          appState.promptText = value.trim()
          appState.screen = "chat"
          triggerRebuild()
          // Process with agent
          processUserInput(value.trim())
        }
      })
    }
  }, 50)

  const tabs: TabOption[] = [
    { name: appState.selectedMode, description: "Select mode" },
    { name: appState.selectedModel, description: "Select model" },
  ]

  return Box(
    {
      id: "prompt-screen",
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    Box(
      {
        flexDirection: "row",
        padding: 0,
        backgroundColor: "transparent",
      },
      // Prompt bar (colored vertical bar)
      Box({
        width: 1,
        backgroundColor: theme.promptBar,
      }),
      // Prompt box
      Box(
        {
          width: 50,
          padding: 0,
          flexDirection: "column",
          backgroundColor: theme.inputBg,
        },
        // Input field
        Box(
          { padding: 1, flexDirection: "row", gap: 1, backgroundColor: theme.inputBg },
          Input({
            id: "prompt-input",
            width: 48,
            backgroundColor: theme.inputBg,
            textColor: theme.text,
            placeholder: "",
            marginLeft:1,
          })
        ),
        // Tab bar
        Box(
          { flexDirection: "row", gap: 1, paddingLeft: 1, paddingRight: 1, paddingBottom: 1 },
          ...tabs.map((tab, idx) => {
            // When inputFocused=true, we're on input. When false, we're on tabs
            // activeTabIndex=0 means Mode tab, =1 means Model tab
            const isActive = !appState.inputFocused && appState.activeTabIndex === idx
            return Box(
              {
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: isActive ? theme.activeTab : theme.inactiveTab,
              },
              Text({ content: tab.name, fg: isActive ? theme.text : theme.textDim })
            )
          })
        )
      )
    )
  )
}

/**
 * Create selection overlay for mode/model selection
 */
export function createSelectionOverlay(contentRoot: RootRenderable | BoxRenderable | null): VNode {
  const theme = appState.currentTheme
  const options = appState.activeTabIndex === 0 ? modeOptions : appState.modelOptions
  const title = appState.activeTabIndex === 0 ? "Select mode" : "Select model"

  // Set up select handler after render
  setTimeout(() => {
    if (!contentRoot) return

    const select = contentRoot.findDescendantById("overlay-select")
    if (select) {
      select.focus()

      select.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: TabOption) => {
        if (option) {
          if (appState.activeTabIndex === 0) {
            appState.selectedMode = option.name
          } else {
            appState.selectedModel = option.name
          }
          appState.overlayOpen = false
          appState.inputFocused = true
          triggerRebuild()

          // Refocus input
          setTimeout(() => {
            if (promptInputElement) {
              promptInputElement.focus()
            }
          }, 50)
        }
      })
    }
  }, 50)

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    Box(
      {
        border: true,
        borderStyle: "rounded",
        width: 48,
        padding: 1,
        gap: 1,
        backgroundColor: theme.overlayBg,
        flexDirection: "column",
      },
      Text({ content: title, fg: theme.text }),
      Select({
        id: "overlay-select",
        options,
        width: 44,
        height: 6,
        textColor: theme.text,
        selectedTextColor: theme.background,
        selectedBackgroundColor: theme.text,
      }),
      Text({ content: "Esc to close", fg: theme.textDim })
    )
  )
}

/**
 * Focus the prompt input
 */
export function focusPromptInput() {
  if (promptInputElement) {
    promptInputElement.focus()
  }
}

/**
 * Handle tab key - toggle between tabs and input
 */
export function handleTabNavigation() {
  if (appState.overlayOpen) {
    // If overlay is open, close it
    appState.overlayOpen = false
    appState.inputFocused = true
  } else if (appState.inputFocused) {
    // Currently on input, move to Mode tab (first tab)
    appState.inputFocused = false
    appState.activeTabIndex = 0
  } else {
    // Currently on a tab, cycle to next
    appState.activeTabIndex = appState.activeTabIndex === 0 ? 1 : 0
  }
  triggerRebuild()
}

/**
 * Handle enter key - open overlay for current tab
 */
export function handleEnterOnTab() {
  if (!appState.inputFocused && !appState.overlayOpen) {
    // On a tab, open the selection overlay
    appState.overlayOpen = true
    triggerRebuild()
  }
}

/**
 * Handle escape - close overlay or return to input
 */
export function handleEscape(): boolean {
  if (appState.overlayOpen) {
    appState.overlayOpen = false
    appState.inputFocused = true
    triggerRebuild()
    return true
  }

  if (!appState.inputFocused) {
    appState.inputFocused = true
    triggerRebuild()
    return true
  }

  return false
}
