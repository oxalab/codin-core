import type { TabOption } from "../types"

export const modeOptions: TabOption[] = [
  { name: "Chat", description: "Conversational replies" },
  { name: "Code", description: "Coding-focused replies" },
  { name: "Search", description: "Info lookup" },
]

// Default models fallback
export const defaultModelOptions: TabOption[] = [
  { name: "gpt-4o", description: "Balanced, fast" },
  { name: "gpt-4.1", description: "Reasoning-focused" },
  { name: "gpt-4o-mini", description: "Lightweight" },
]

// Dynamic model options (will be populated at runtime)
let currentModelOptions: TabOption[] = [...defaultModelOptions]

/**
 * Set model options dynamically
 */
export function setModelOptions(options: TabOption[]): void {
  currentModelOptions = options
}

/**
 * Get current model options
 */
export function getModelOptions(): TabOption[] {
  return currentModelOptions
}

export const buildTabOptions = (selectedMode: string, selectedModel: string): TabOption[] => [
  { name: selectedMode, description: "Select a mode" },
  { name: selectedModel, description: "Select a model" },
]
