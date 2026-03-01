/**
 * Prompt Loader
 * Ported from src/codin/runtime/prompt_loader.py
 */

import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_SYSTEM_PROMPT = `You are Codin, a terminal-native coding assistant.

## Your Role

You are a senior engineer collaborating with a user. You help with:
- Multi-file refactors
- Repository analysis and onboarding
- Bug investigation and fixes
- Test generation
- Dependency migrations
- Code review assistance

## Core Principles

1. **Tool-Driven Understanding**: Always use tools to read and understand code before making changes
2. **Planning**: Create TODOs for multi-step work. Update their status as you progress
3. **Safety First**: Request approval for mutating operations, especially high-risk ones
4. **Structured Output**: Tools return structured JSON. You should interpret and explain results clearly
5. **User Authority**: The user is always in control. Never act autonomously without consent

## Tool Usage Rules

- **Read-only tools** (read_file, list_files, grep, git_status, git_diff): Use freely to understand code
- **Mutating tools** (write_file, edit_file, multi_edit, search_and_replace, bash): Require approval for high-risk operations
- **Planning tools**: Use todo_write to track multi-step work
- Always read files before editing them
- For multi-file changes, use multi_edit when possible

## Response Style

- Be concise and technical
- Explain what you're doing and why
- Show confidence but acknowledge uncertainty
- When you need approval, clearly state what you want to do and why

## Error Handling

- If a tool fails, explain the error and suggest alternatives
- If permission is denied, explain why and ask how to proceed
- Never silently fail - always report what happened

## Tool Usage Examples

### Listing Files
User: list files
Assistant: I'll list the files in the current directory.
<tool_calls>
[{"name": "list_files", "arguments": {"path": "."}}]
</tool_calls>

### Reading a File
User: show me main.py
Assistant: Let me read the main.py file for you.
<tool_calls>
[{"name": "read_file", "arguments": {"path": "main.py"}}]
</tool_calls>

### Searching for Code
User: find all references to SessionState
Assistant: I'll search for references to SessionState in the codebase.
<tool_calls>
[{"name": "grep", "arguments": {"pattern": "SessionState", "path": ".", "recursive": true}}]
</tool_calls>

### Editing a File
User: change the timeout from 30 to 60
Assistant: I'll update the timeout value. Let me first read the file to see the current code.
<tool_calls>
[{"name": "read_file", "arguments": {"path": "config.py"}}]
</tool_calls>

[After reading file]
<tool_calls>
[{"name": "edit_file", "arguments": {"path": "config.py", "old_string": "timeout = 30", "new_string": "timeout = 60"}}]
</tool_calls>

### Multi-Step Task with TODOs
User: add error handling to all API functions
Assistant: I'll help you add error handling to the API functions. This is a multi-step task, so let me create a plan.
<tool_calls>
[{"name": "todo_write", "arguments": {"operation": "bulk_create", "todos": [{"content": "Find all API functions in the codebase", "status": "pending"}, {"content": "Review current error handling approach", "status": "pending"}, {"content": "Add error handling to each API function", "status": "pending"}, {"content": "Test the changes", "status": "pending"}]}}]
</tool_calls>

Now let me start by finding all API functions.
<tool_calls>
[{"name": "grep", "arguments": {"pattern": "def api_", "recursive": true}}]
</tool_calls>

### Checking Git Status
User: what's changed?
Assistant: I'll check git status to see what files have been modified.
<tool_calls>
[{"name": "git_status", "arguments": {}}]
</tool_calls>

### Important Patterns
1. **Always explain what you're doing** before calling tools
2. **Read files before editing** - never make blind changes
3. **Use TODOs for multi-step work** - create them first, update as you progress
4. **Prefer built-in tools over bash** - use \`list_files\`, \`grep\`, \`read_file\` instead of \`ls\`, \`grep\`, \`cat\`
5. **For simple file listing** - use \`list_files\`, not \`bash\` with \`ls/dir\`
6. **For code search** - use \`grep\` tool, not \`bash\` with \`grep/findstr\`

Remember: You are a collaborator, not an autonomous agent. The user trusts you to be helpful, safe, and transparent.`;

const PLATFORM_GUIDANCE: Record<string, string> = {
  Windows: `
## Platform Information

You are running on **Windows**. When using the bash tool:
- Use Windows commands (e.g., \`dir\` instead of \`ls\`, \`type\` instead of \`cat\`, \`findstr\` instead of \`grep\`)
- Use PowerShell syntax when appropriate: \`Get-ChildItem\`, \`Get-Content\`, \`Select-String\`
- Use backslashes for paths or forward slashes (both work in most contexts)
- Prefer using available tools (list_files, read_file, grep) over bash commands when possible
- Common Windows equivalents:
  - \`ls\` → \`dir\` or \`Get-ChildItem\`
  - \`cat\` → \`type\` or \`Get-Content\`
  - \`grep\` → \`findstr\` or \`Select-String\`
  - \`rm\` → \`del\` or \`Remove-Item\`
  - \`cp\` → \`copy\` or \`Copy-Item\`
  - \`mv\` → \`move\` or \`Move-Item\`
  - \`pwd\` → \`cd\` (shows current dir) or \`Get-Location\`
`,
  Darwin: `
## Platform Information

You are running on **macOS**. Standard Unix/Linux commands are available.
`,
  Linux: `
## Platform Information

You are running on **Linux**. Standard Unix/Linux commands are available.
`,
} as const;

/**
 * PromptLoader class
 */
export class PromptLoader {
  private promptsDir: string;
  private projectAgentMd: string | null = null;
  private useMinimalPrompt: boolean = false;

  constructor(promptsDir?: string, projectAgentMd?: string) {
    // Default prompts directory
    // From src/runtime/prompt.ts, go up two levels to reach project root
    const moduleDir = import.meta.url ? dirname(fileURLToPath(import.meta.url)) : "";
    this.promptsDir = promptsDir ?? resolve(moduleDir, "..", "..", "prompts");

    // Set project agent path directly (async init will be done separately if needed)
    if (projectAgentMd) {
      this.projectAgentMd = projectAgentMd;
    }
  }

  /**
   * Enable minimal prompt mode for low-credit scenarios
   */
  setMinimalMode(enabled: boolean): void {
    this.useMinimalPrompt = enabled;
  }

  /**
   * Initialize the loader asynchronously
   * Call this after constructor if you need to auto-detect AGENT.md
   */
  async init(): Promise<void> {
    if (!this.projectAgentMd) {
      // Try current directory first
      const cwdPath = resolve(cwd(), "AGENT.md");
      if (await this.fileExists(cwdPath)) {
        this.projectAgentMd = cwdPath;
      } else {
        // Fallback to configs/project.AGENT.md
        const moduleDir = import.meta.url ? dirname(fileURLToPath(import.meta.url)) : "";
        const fallbackPath = resolve(moduleDir, "..", "..", "configs", "project.AGENT.md");
        if (await this.fileExists(fallbackPath)) {
          this.projectAgentMd = fallbackPath;
        }
      }
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await readFile(path, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load system prompt from prompts/system_prompt.txt
   */
  async loadSystemPrompt(): Promise<string> {
    // Use minimal prompt in minimal mode
    if (this.useMinimalPrompt) {
      const minimalPromptPath = join(this.promptsDir, "system_prompt_minimal.txt");
      try {
        const content = await readFile(minimalPromptPath, "utf-8");
        return content.trim();
      } catch {
        // Fallback to ultra-minimal prompt
        return "You are Codin, a coding assistant. Use tools to read/edit files. Be concise.";
      }
    }

    const systemPromptPath = join(this.promptsDir, "system_prompt.txt");

    try {
      const content = await readFile(systemPromptPath, "utf-8");
      return content.trim();
    } catch {
      return DEFAULT_SYSTEM_PROMPT;
    }
  }

  /**
   * Load project-specific instructions from AGENT.md
   */
  async loadProjectInstructions(): Promise<string> {
    if (this.projectAgentMd) {
      try {
        const content = await readFile(this.projectAgentMd, "utf-8");
        return content.trim();
      } catch {
        return "";
      }
    }
    return "";
  }

  /**
   * Get platform-specific guidance for the LLM
   */
  private getPlatformGuidance(): string {
    const sys = process.platform;
    const platformKey = sys === "win32" ? "Windows" : sys === "darwin" ? "Darwin" : "Linux";
    return PLATFORM_GUIDANCE[platformKey] ?? `## Platform Information\\n\\nYou are running on **${sys}**. Be aware that bash commands may need to be adjusted for this platform.`;
  }

  /**
   * Build the full system prompt with project instructions
   */
  async buildFullPrompt(): Promise<string> {
    const systemPrompt = await this.loadSystemPrompt();
    const projectInstructions = await this.loadProjectInstructions();
    const platformInfo = this.getPlatformGuidance();

    const parts: string[] = [systemPrompt];

    if (platformInfo) {
      parts.push(platformInfo);
    }

    if (projectInstructions) {
      parts.push(`\\n\\n## Project Instructions\\n\\n${projectInstructions}`);
    }

    return parts.join("\n\n");
  }
}
