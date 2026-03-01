/**
 * Codin Main Entry Point
 * Using @opentui/core constructs (no React)
 */

import { createCliRenderer, Box, Text, type CliRenderer } from "@opentui/core"
import { createApp, initializeAgent, rebuildUI, appState } from "./tui/app"

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
})

let renderer: CliRenderer

async function main() {
  console.log("Creating renderer...")
  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    enableMouseMovement: true,
  })
  console.log("Renderer created")

  // Show loading state
  const loadingRoot = Box(
    {
      id: "loading-root",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
    },
    Text({ content: "Initializing Codin...", fg: "#64748b" })
  )
  renderer.root.add(loadingRoot)
  console.log("Loading screen added")

  // Create app
  console.log("Creating app...")
  const app = createApp(renderer)
  console.log("App created")

  // Initialize agent in background
  console.log("Starting agent initialization...")
  initializeAgent().then(() => {
    console.log("Agent initialized, showing app...")
    renderer.root.remove("loading-root")
    renderer.root.add(app)
    console.log(`State: isInitializing=${appState.isInitializing}, initStatus=${appState.initStatus}`)
    rebuildUI()
  }).catch((err: Error) => {
    console.error(`Agent init failed: ${err.message}`)
    renderer.root.remove("loading-root")
    appState.initError = `Failed to initialize: ${err.message}`
    renderer.root.add(app)
    rebuildUI()
  })
}

main().catch(console.error)

export { renderer }
