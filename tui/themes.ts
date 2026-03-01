/**
 * Theme System
 * Color themes for the TUI
 */

export interface Theme {
  id: string
  name: string
  description: string
  // Primary colors
  primary: string
  secondary: string
  accent: string
  // Background colors
  background: string
  backgroundDark: string
  backgroundLight: string
  // Text colors
  text: string
  textMuted: string
  textDim: string
  // UI colors
  border: string
  inputBg: string
  overlayBg: string
  // Status colors
  success: string
  warning: string
  error: string
  info: string
  // Custom colors
  sidebarBg: string
  activeTab: string
  inactiveTab: string
  promptBar: string
  chatInputBg: string
  userMsgBg: string
  userMsgText: string
  toolRunning: string
  toolComplete: string
  toolError: string
  riskLow: string
  riskMedium: string
  riskHigh: string
  riskCritical: string
}

/**
 * Theme definitions
 */
export const themes: Record<string, Theme> = {
  // Default dark blue theme (current)
  default: {
    id: "default",
    name: "Default",
    description: "Original dark blue theme",
    primary: "#60a5fa",
    secondary: "#3b82f6",
    accent: "#f59e0b",
    background: "#000000",
    backgroundDark: "#0a0a0f",
    backgroundLight: "#0D0D2C",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    textDim: "#64748b",
    border: "#1e293b",
    inputBg: "#0D0D2C",
    overlayBg: "#0f172a",
    success: "#22c55e",
    warning: "#fbbf24",
    error: "#ef4444",
    info: "#3b82f6",
    sidebarBg: "#0b1220",
    activeTab: "#1e293b",
    inactiveTab: "#0D0D2C",
    promptBar: "#60a5fa",
    chatInputBg: "#101041",
    userMsgBg: "#FFFFFF",
    userMsgText: "#000000",
    toolRunning: "#fbbf24",
    toolComplete: "#22c55e",
    toolError: "#ef4444",
    riskLow: "#22c55e",
    riskMedium: "#eab308",
    riskHigh: "#f97316",
    riskCritical: "#ef4444",
  },

  // Tokyo Night
  tokyoNight: {
    id: "tokyoNight",
    name: "Tokyo Night",
    description: "Inspired by Tokyo Night theme",
    primary: "#7aa2f7",
    secondary: "#bb9af7",
    accent: "#e0af68",
    background: "#1a1b26",
    backgroundDark: "#16161e",
    backgroundLight: "#24283b",
    text: "#c0caf5",
    textMuted: "#a9b1d6",
    textDim: "#565f89",
    border: "#414868",
    inputBg: "#24283b",
    overlayBg: "#1f2335",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    info: "#7aa2f7",
    sidebarBg: "#1f2335",
    activeTab: "#3b4261",
    inactiveTab: "#24283b",
    promptBar: "#7aa2f7",
    chatInputBg: "#1f2335",
    userMsgBg: "#3b4261",
    userMsgText: "#c0caf5",
    toolRunning: "#e0af68",
    toolComplete: "#9ece6a",
    toolError: "#f7768e",
    riskLow: "#9ece6a",
    riskMedium: "#e0af68",
    riskHigh: "#ff9e64",
    riskCritical: "#f7768e",
  },

  // Dracula
  dracula: {
    id: "dracula",
    name: "Dracula",
    description: "Classic Dracula theme",
    primary: "#bd93f9",
    secondary: "#ff79c6",
    accent: "#f1fa8c",
    background: "#282a36",
    backgroundDark: "#1e1f29",
    backgroundLight: "#44475a",
    text: "#f8f8f2",
    textMuted: "#6272a4",
    textDim: "#44475a",
    border: "#44475a",
    inputBg: "#44475a",
    overlayBg: "#282a36",
    success: "#50fa7b",
    warning: "#f1fa8c",
    error: "#ff5555",
    info: "#8be9fd",
    sidebarBg: "#1e1f29",
    activeTab: "#44475a",
    inactiveTab: "#282a36",
    promptBar: "#bd93f9",
    chatInputBg: "#1e1f29",
    userMsgBg: "#44475a",
    userMsgText: "#f8f8f2",
    toolRunning: "#f1fa8c",
    toolComplete: "#50fa7b",
    toolError: "#ff5555",
    riskLow: "#50fa7b",
    riskMedium: "#f1fa8c",
    riskHigh: "#ffb86c",
    riskCritical: "#ff5555",
  },

  // Nord
  nord: {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish color palette",
    primary: "#88c0d0",
    secondary: "#81a1c1",
    accent: "#ebcb8b",
    background: "#2e3440",
    backgroundDark: "#242933",
    backgroundLight: "#3b4252",
    text: "#eceff4",
    textMuted: "#a3be8c",
    textDim: "#4c566a",
    border: "#4c566a",
    inputBg: "#3b4252",
    overlayBg: "#2e3440",
    success: "#a3be8c",
    warning: "#ebcb8b",
    error: "#bf616a",
    info: "#88c0d0",
    sidebarBg: "#242933",
    activeTab: "#3b4252",
    inactiveTab: "#2e3440",
    promptBar: "#88c0d0",
    chatInputBg: "#242933",
    userMsgBg: "#3b4252",
    userMsgText: "#eceff4",
    toolRunning: "#ebcb8b",
    toolComplete: "#a3be8c",
    toolError: "#bf616a",
    riskLow: "#a3be8c",
    riskMedium: "#ebcb8b",
    riskHigh: "#d08770",
    riskCritical: "#bf616a",
  },

  // Gruvbox Dark
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox",
    description: "Warm retro color scheme",
    primary: "#83a598",
    secondary: "#d3869b",
    accent: "#fabd2f",
    background: "#282828",
    backgroundDark: "#1d2021",
    backgroundLight: "#3c3836",
    text: "#ebdbb2",
    textMuted: "#a89984",
    textDim: "#665c54",
    border: "#3c3836",
    inputBg: "#3c3836",
    overlayBg: "#282828",
    success: "#b8bb26",
    warning: "#fabd2f",
    error: "#fb4934",
    info: "#83a598",
    sidebarBg: "#1d2021",
    activeTab: "#3c3836",
    inactiveTab: "#282828",
    promptBar: "#83a598",
    chatInputBg: "#1d2021",
    userMsgBg: "#3c3836",
    userMsgText: "#ebdbb2",
    toolRunning: "#fabd2f",
    toolComplete: "#b8bb26",
    toolError: "#fb4934",
    riskLow: "#b8bb26",
    riskMedium: "#fabd2f",
    riskHigh: "#fe8019",
    riskCritical: "#fb4934",
  },

  // Catppuccin Mocha
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    description: "Soothing pastel dark theme",
    primary: "#89b4fa",
    secondary: "#cba6f7",
    accent: "#f9e2af",
    background: "#1e1e2e",
    backgroundDark: "#181825",
    backgroundLight: "#313244",
    text: "#cdd6f4",
    textMuted: "#a6adc8",
    textDim: "#6c7086",
    border: "#45475a",
    inputBg: "#313244",
    overlayBg: "#1e1e2e",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    info: "#89b4fa",
    sidebarBg: "#181825",
    activeTab: "#313244",
    inactiveTab: "#1e1e2e",
    promptBar: "#89b4fa",
    chatInputBg: "#181825",
    userMsgBg: "#313244",
    userMsgText: "#cdd6f4",
    toolRunning: "#f9e2af",
    toolComplete: "#a6e3a1",
    toolError: "#f38ba8",
    riskLow: "#a6e3a1",
    riskMedium: "#f9e2af",
    riskHigh: "#fab387",
    riskCritical: "#f38ba8",
  },

  // Monokai
  monokai: {
    id: "monokai",
    name: "Monokai",
    description: "Classic dark theme for code editors",
    primary: "#66d9ef",
    secondary: "#f92672",
    accent: "#e6db74",
    background: "#272822",
    backgroundDark: "#1e1f1a",
    backgroundLight: "#3e3d32",
    text: "#f8f8f2",
    textMuted: "#a6a69c",
    textDim: "#75715e",
    border: "#49483e",
    inputBg: "#3e3d32",
    overlayBg: "#272822",
    success: "#a6e22e",
    warning: "#e6db74",
    error: "#f92672",
    info: "#66d9ef",
    sidebarBg: "#1e1f1a",
    activeTab: "#3e3d32",
    inactiveTab: "#272822",
    promptBar: "#66d9ef",
    chatInputBg: "#1e1f1a",
    userMsgBg: "#3e3d32",
    userMsgText: "#f8f8f2",
    toolRunning: "#e6db74",
    toolComplete: "#a6e22e",
    toolError: "#f92672",
    riskLow: "#a6e22e",
    riskMedium: "#e6db74",
    riskHigh: "#fd971f",
    riskCritical: "#f92672",
  },

  // Solarized Dark
  solarized: {
    id: "solarized",
    name: "Solarized Dark",
    description: "Precision color scheme for developers",
    primary: "#268bd2",
    secondary: "#6c71c4",
    accent: "#b58900",
    background: "#002b36",
    backgroundDark: "#001e26",
    backgroundLight: "#073642",
    text: "#839496",
    textMuted: "#93a1a1",
    textDim: "#586e75",
    border: "#073642",
    inputBg: "#073642",
    overlayBg: "#002b36",
    success: "#859900",
    warning: "#b58900",
    error: "#dc322f",
    info: "#268bd2",
    sidebarBg: "#001e26",
    activeTab: "#073642",
    inactiveTab: "#002b36",
    promptBar: "#268bd2",
    chatInputBg: "#001e26",
    userMsgBg: "#073642",
    userMsgText: "#839496",
    toolRunning: "#b58900",
    toolComplete: "#859900",
    toolError: "#dc322f",
    riskLow: "#859900",
    riskMedium: "#b58900",
    riskHigh: "#cb4b16",
    riskCritical: "#dc322f",
  },

  // Cyberpunk
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon-lit futuristic theme",
    primary: "#00ff9f",
    secondary: "#ff00ff",
    accent: "#fcee0a",
    background: "#0d0d0d",
    backgroundDark: "#080808",
    backgroundLight: "#1a1a1a",
    text: "#ffffff",
    textMuted: "#b0b0b0",
    textDim: "#666666",
    border: "#333333",
    inputBg: "#1a1a1a",
    overlayBg: "#0d0d0d",
    success: "#00ff9f",
    warning: "#fcee0a",
    error: "#ff0055",
    info: "#00f3ff",
    sidebarBg: "#080808",
    activeTab: "#1a1a1a",
    inactiveTab: "#0d0d0d",
    promptBar: "#00ff9f",
    chatInputBg: "#080808",
    userMsgBg: "#1a1a1a",
    userMsgText: "#ffffff",
    toolRunning: "#fcee0a",
    toolComplete: "#00ff9f",
    toolError: "#ff0055",
    riskLow: "#00ff9f",
    riskMedium: "#fcee0a",
    riskHigh: "#ff6600",
    riskCritical: "#ff0055",
  },

  // Light / White theme
  light: {
    id: "light",
    name: "Light",
    description: "Clean white theme for bright environments",
    primary: "#2563eb",
    secondary: "#3b82f6",
    accent: "#f59e0b",
    background: "#ffffff",
    backgroundDark: "#f8fafc",
    backgroundLight: "#e2e8f0",
    text: "#1e293b",
    textMuted: "#64748b",
    textDim: "#94a3b8",
    border: "#e2e8f0",
    inputBg: "#f8fafc",
    overlayBg: "#ffffff",
    success: "#16a34a",
    warning: "#f59e0b",
    error: "#dc2626",
    info: "#2563eb",
    sidebarBg: "#f8fafc",
    activeTab: "#e2e8f0",
    inactiveTab: "#f8fafc",
    promptBar: "#2563eb",
    chatInputBg: "#f1f5f9",
    userMsgBg: "#dbeafe",
    userMsgText: "#1e293b",
    toolRunning: "#f59e0b",
    toolComplete: "#16a34a",
    toolError: "#dc2626",
    riskLow: "#16a34a",
    riskMedium: "#f59e0b",
    riskHigh: "#ea580c",
    riskCritical: "#dc2626",
  },
}

/**
 * Get theme by ID
 */
export function getTheme(id: string): Theme {
  return themes[id] || themes.default
}

/**
 * Get all themes as array for selection
 */
export function getAllThemes(): Theme[] {
  return Object.values(themes)
}
