import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const mascot = readFileSync(
  fileURLToPath(new URL("../../constants/mascot.txt", import.meta.url)),
  "utf8",
)

export const heading = readFileSync(
  fileURLToPath(new URL("../../constants/heading.txt", import.meta.url)),
  "utf8",
).trimEnd()
