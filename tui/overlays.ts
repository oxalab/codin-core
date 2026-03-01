/**
 * Overlay Components
 * Command-palette style overlays for mode and model selection
 * Uses Select component for consistent navigation with command palette
 */

import {
  Box,
  Text,
  Input,
  Select,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  type VNode,
  type BoxRenderable,
  type RootRenderable,
} from "@opentui/core"
import { appState, triggerRebuild, renderer } from "./state"
import type { Theme } from "./themes"
import { getModelOptions } from "./config/options"
import { focusPromptInput } from "./prompt-screen"

// Store references for navigation
let overlayInput: InputRenderable | null = null
let overlaySelect: SelectRenderable | null = null
let overlaySelectOptions: any[] = []

// Export for keyboard navigation
export function getOverlayElements() {
  return { input: overlayInput, select: overlaySelect }
}

/**
 * Mode options
 */
const modeOptions = [
  {
    id: "mode-chat",
    label: "Chat",
    description: "Conversational replies",
    category: "Mode",
    value: "Chat",
  },
  {
    id: "mode-code",
    label: "Code",
    description: "Coding-focused replies",
    category: "Mode",
    value: "Code",
  },
  {
    id: "mode-search",
    label: "Search",
    description: "Info lookup",
    category: "Mode",
    value: "Search",
  },
]

/**
 * Get model options
 */
function getModelOpts() {
  const models = getModelOptions()
  return models.map((m, idx) => ({
    id: `model-${idx}`,
    label: m.name,
    description: m.description,
    category: "Model",
    value: m.name,
  }))
}

/**
 * Convert options to Select format
 */
function toSelectOptions(options: any[], query: string) {
  const filtered = !query.trim()
    ? options
    : options.filter((opt) =>
        opt.label.toLowerCase().includes(query.toLowerCase()) ||
        opt.description?.toLowerCase().includes(query.toLowerCase()) ||
        opt.category?.toLowerCase().includes(query.toLowerCase())
      )

  return filtered.map((opt) => ({
    name: opt.label,
    description: opt.category ? `${opt.category}: ${opt.description}` : opt.description,
    _option: opt,
  }))
}

/**
 * Create a palette-style overlay with Select component
 */
function createPaletteOverlay(
  title: string,
  options: any[],
  theme: Theme,
  onSelect: (option: any) => void
): VNode {
  const query = appState.overlaySearchQuery
  const selectedIndex = appState.overlaySelectedIndex

  // Convert to Select options
  const selectOptions = toSelectOptions(options, query)
  overlaySelectOptions = selectOptions

  // Set up event handlers after render
  setTimeout(() => {
    const root = renderer?.root
    if (!root) return

    const input = root.findDescendantById("overlay-input") as InputRenderable | null
    const select = root.findDescendantById("overlay-select") as SelectRenderable | null

    if (input) {
      overlayInput = input
      input.focus()
      input.value = query

      // Handle input changes - update select options in real-time (letter by letter)
      input.on(InputRenderableEvents.CHANGE, (value: string) => {
        appState.overlaySearchQuery = value

        // Get filtered options for current query
        const newOptions = toSelectOptions(options, value)

        // Update select options directly
        if (select) {
          select.options = newOptions
          select.selectedIndex = 0
          appState.overlaySelectedIndex = 0
          overlaySelectOptions = newOptions
        }
      })

      // Handle Enter to confirm selection
      input.on(InputRenderableEvents.ENTER, () => {
        // Get current value from input, not cached query
        const currentValue = input.value || appState.overlaySearchQuery

        // Filter options based on current value
        const filteredOptions = toSelectOptions(options, currentValue)

        // Only select if there are matching options
        if (filteredOptions.length > 0 && appState.overlaySelectedIndex < filteredOptions.length) {
          const selectedOption = filteredOptions[appState.overlaySelectedIndex]._option
          if (selectedOption) {
            onSelect(selectedOption)
          }
        }
        // If no matches, don't close - keep palette open
      })
    }

    if (select) {
      overlaySelect = select
      select.selectedIndex = Math.min(selectedIndex, selectOptions.length - 1)

      // Handle selection from select
      select.on(SelectRenderableEvents.ITEM_SELECTED, (index: number, option: any) => {
        const opt = option._option
        if (opt) {
          onSelect(opt)
        }
      })

      // Track selection changes
      select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
        appState.overlaySelectedIndex = index
      })
    }
  }, 50)

  return Box(
    {
      id: "overlay-palette",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 3,
      backgroundColor: "#00000065",
    },
    Box(
      {
        id: "overlay-box",
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
        Text({ content: title, fg: theme.primary }),
        Text({ content: "esc to close", fg: theme.textDim })
      ),
      // Search input
      Input({
        id: "overlay-input",
        width: "100%",
        placeholder: "Type to filter...",
        backgroundColor: theme.backgroundDark,
        textColor: theme.text,
      }),
      // Options list with Select
      Select({
        id: "overlay-select",
        options: selectOptions,
        width: "100%",
        height: 12,
        selectedIndex: Math.min(selectedIndex, selectOptions.length - 1),
        selectedBackgroundColor: theme.backgroundLight,
        selectedTextColor: theme.text,
        showScrollIndicator: true,
      }),
      // Footer
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingTop: 1,
        },
        Text({ content: "↑↓ navigate, enter confirm", fg: theme.textDim }),
        Text({ content: `${selectOptions.length} options`, fg: theme.textDim })
      )
    )
  )
}

/**
 * Create mode selection overlay
 */
export function createModeSelectionOverlay(
  contentRoot: RootRenderable | BoxRenderable | null
): VNode {
  const theme = appState.currentTheme

  return createPaletteOverlay(
    "Select Mode",
    modeOptions,
    theme,
    (option) => {
      appState.selectedMode = option.value
      closeOverlay()
    }
  )
}

/**
 * Create model selection overlay
 */
export function createModelSelectionOverlay(
  contentRoot: RootRenderable | BoxRenderable | null
): VNode {
  const theme = appState.currentTheme
  const modelOpts = getModelOpts()

  return createPaletteOverlay(
    "Select Model",
    modelOpts,
    theme,
    (option) => {
      appState.selectedModel = option.value
      closeOverlay()
    }
  )
}

/**
 * Close overlay and reset state
 */
export function closeOverlay() {
  appState.overlayOpen = false
  appState.overlaySearchQuery = ""
  appState.overlaySelectedIndex = 0
  appState.inputFocused = true
  overlayInput = null
  overlaySelect = null
  triggerRebuild()
  setTimeout(() => focusPromptInput(), 50)
}

/**
 * Navigate overlay selection up (deprecated - handled by Select)
 */
export function navigateOverlayUp() {
  if (overlaySelect && appState.overlaySelectedIndex > 0) {
    appState.overlaySelectedIndex--
    overlaySelect.selectedIndex = appState.overlaySelectedIndex
  }
}

/**
 * Navigate overlay selection down (deprecated - handled by Select)
 */
export function navigateOverlayDown() {
  if (overlaySelect) {
    const maxIndex = overlaySelectOptions.length - 1
    if (appState.overlaySelectedIndex < maxIndex) {
      appState.overlaySelectedIndex++
      overlaySelect.selectedIndex = appState.overlaySelectedIndex
    }
  }
}

/**
 * Confirm overlay selection (deprecated - handled by Select)
 */
export function confirmOverlaySelection() {
  const isMode = appState.activeTabIndex === 0
  const options = isMode ? modeOptions : getModelOpts()
  const query = appState.overlaySearchQuery

  const filtered = !query.trim()
    ? options
    : options.filter((opt) =>
        opt.label.toLowerCase().includes(query.toLowerCase()) ||
        opt.description?.toLowerCase().includes(query.toLowerCase())
      )

  const selected = filtered[appState.overlaySelectedIndex]
  if (selected) {
    if (isMode) {
      appState.selectedMode = selected.value
    } else {
      appState.selectedModel = selected.value
    }
    closeOverlay()
  }
}
