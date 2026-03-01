/**
 * Permission Engine
 * Ported from src/codin/agent/permission_engine.py
 */

import type {
  SessionState,
  PermissionRule,
} from "../types/agent.js";
import type {
  PermissionRequest,
  ApprovalCallback,
} from "../types/permissions.js";
import { PermissionDecision, RiskLevel } from "../types/permissions.js";

/**
 * Simple glob pattern matcher
 * Converts shell glob patterns to regex for matching
 */
function globMatch(pattern: string, text: string): boolean {
  // Escape special regex characters except * and ?
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(text);
}

/**
 * Read-only tools that don't require permission
 */
const READ_ONLY_TOOLS = new Set([
  "read_file",
  "list_files",
  "grep",
  "git_status",
  "git_diff",
]);

/**
 * Mutating tools (higher risk)
 */
const MUTATING_TOOLS = new Set([
  "write_file",
  "edit_file",
  "multi_edit",
  "search_and_replace",
  "bash",
  "copy_file",
  "move_file",
  "delete_file",
  "create_directory",
  "compress",
  "extract",
  "rebuild_init",
  "capture_site",
  "extract_design_tokens",
  "extract_component_map",
  "harvest_assets",
  "generate_code",
  "visual_diff",
  "auto_fix_pass",
  "rebuild_finalize",
]);

/**
 * Sensitive file patterns
 */
const SENSITIVE_PATTERNS = [
  "/.env",
  "/Dockerfile",
  "/.github/workflows/",
  "/package.json",
  "/requirements.txt",
  "/pyproject.toml",
  "/Cargo.toml",
];

/**
 * Dangerous bash command patterns
 */
const DANGEROUS_COMMANDS = ["rm -rf", "sudo", "chmod", "dd if=", "mkfs", "fdisk"];

/**
 * Permission Engine class
 * Handles permission checking and user approval
 */
export class PermissionEngine {
  private state: SessionState;
  private approvalCallback: ApprovalCallback | null = null;

  constructor(state: SessionState) {
    this.state = state;
  }

  /**
   * Set approval callback for requesting user approval
   */
  setApprovalCallback(callback: ApprovalCallback): void {
    this.approvalCallback = callback;
  }

  /**
   * Identify files that will be affected by a tool call
   */
  private _identifyAffectedFiles(toolName: string, toolArgs: Record<string, unknown>): string[] {
    const affected: string[] = [];

    if (
      toolName === "write_file" ||
      toolName === "edit_file" ||
      toolName === "search_and_replace" ||
      toolName === "delete_file" ||
      toolName === "create_directory"
    ) {
      if ("path" in toolArgs) {
        affected.push(String(toolArgs.path));
      }
    } else if (toolName === "copy_file" || toolName === "move_file") {
      if ("source" in toolArgs) {
        affected.push(String(toolArgs.source));
      }
      if ("destination" in toolArgs) {
        affected.push(String(toolArgs.destination));
      }
    } else if (toolName === "multi_edit") {
      if ("edits" in toolArgs && Array.isArray(toolArgs.edits)) {
        for (const edit of toolArgs.edits) {
          if ("path" in edit) {
            affected.push(String(edit.path));
          }
        }
      }
    } else if (toolName === "compress") {
      if ("sources" in toolArgs && Array.isArray(toolArgs.sources)) {
        affected.push(...(toolArgs.sources as string[]));
      }
      if ("destination" in toolArgs) {
        affected.push(String(toolArgs.destination));
      }
    } else if (toolName === "extract") {
      if ("source" in toolArgs) {
        affected.push(String(toolArgs.source));
      }
      if ("destination" in toolArgs) {
        affected.push(String(toolArgs.destination));
      }
    } else if (toolName === "bash") {
      // Try to extract file paths from command
      const command = String(toolArgs.command || "");
      // Simple heuristic - could be improved
      if (DANGEROUS_COMMANDS.some((d) => command.includes(d))) {
        affected.push("*");
      }
    } else if (
      [
        "rebuild_init",
        "capture_site",
        "extract_design_tokens",
        "extract_component_map",
        "harvest_assets",
        "generate_code",
        "visual_diff",
        "auto_fix_pass",
        "rebuild_finalize",
      ].includes(toolName)
    ) {
      const outputDir = String(toolArgs.output_dir || "rebuild_runs");
      const runId = String(toolArgs.run_id || "*");
      affected.push(`${outputDir}/${runId}`);
    }

    return affected;
  }

  /**
   * Classify risk level of a tool call
   * Mutating tools possess higher risk
   */
  private _classifyRisk(
    toolName: string,
    toolArgs: Record<string, unknown>,
    affectedFiles: string[]
  ): RiskLevel {
    // Not a mutating tool - low risk
    if (!MUTATING_TOOLS.has(toolName)) {
      return RiskLevel.LOW;
    }

    // delete_file is high risk by default
    if (toolName === "delete_file") {
      return RiskLevel.HIGH;
    }

    // Bash is risky - check for dangerous commands
    if (toolName === "bash") {
      const command = String(toolArgs.command || "").toLowerCase();
      if (DANGEROUS_COMMANDS.some((d) => command.includes(d.toLowerCase()))) {
        return RiskLevel.CRITICAL;
      }
      return RiskLevel.HIGH;
    }

    // Check for sensitive files
    for (const filePath of affectedFiles) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (globMatch(pattern, filePath)) {
          return RiskLevel.HIGH;
        }
      }
    }

    // Multi-file edits are medium risk
    if (
      (toolName === "multi_edit" || toolName === "compress") &&
      affectedFiles.length > 3
    ) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.MEDIUM;
  }

  /**
   * Check if any permission rules apply
   */
  private _checkPermissionRules(
    toolName: string,
    affectedFiles: string[]
  ): PermissionDecision | null {
    for (const rule of this.state.permission_rules) {
      // Check if tool matches
      if (rule.tool !== toolName && rule.tool !== "*") {
        continue;
      }

      // Check if path matches
      for (const filePath of affectedFiles) {
        if (globMatch(rule.path_glob, filePath)) {
          return rule.allow ? PermissionDecision.ALLOW : PermissionDecision.DENY;
        }
      }
    }

    return null;
  }

  /**
   * Check if a tool call is allowed
   * Returns (decision, reason)
   */
  async checkPermission(
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<[PermissionDecision, string]> {
    const affectedFiles = this._identifyAffectedFiles(toolName, toolArgs);
    const riskLevel = this._classifyRisk(toolName, toolArgs, affectedFiles);

    // Check explicit permission rules first
    const ruleDecision = this._checkPermissionRules(toolName, affectedFiles);
    if (ruleDecision) {
      return [ruleDecision, "Permission rule"];
    }

    // Read-only tools are auto-allow
    if (READ_ONLY_TOOLS.has(toolName)) {
      return [PermissionDecision.ALLOW, "Read-only tool"];
    }

    // High/critical risk always requires prompt
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      if (this.approvalCallback) {
        const request: PermissionRequest = {
          tool_name: toolName,
          arguments: toolArgs,
          affected_files: affectedFiles,
          risk_level: riskLevel,
        };
        const decision = await this.approvalCallback(request);
        return [decision, "User approval"];
      }
      return [PermissionDecision.PROMPT, "High risk operation"];
    }

    // Medium risk - check default privacy
    // For now, default to prompt for mutating operations
    if (riskLevel === RiskLevel.MEDIUM) {
      if (this.approvalCallback) {
        const request: PermissionRequest = {
          tool_name: toolName,
          arguments: toolArgs,
          affected_files: affectedFiles,
          risk_level: riskLevel,
        };
        const decision = await this.approvalCallback(request);
        return [decision, "User approval"];
      }
      return [PermissionDecision.PROMPT, "Medium risk operation"];
    }

    return [PermissionDecision.ALLOW, "Low risk operation"];
  }

  /**
   * Add a permission rule to state
   */
  addPermissionRule(
    ruleId: string,
    tool: string,
    pathGlob: string,
    allow: boolean,
    description: string,
    persistent = false
  ): void {
    const rule: PermissionRule = {
      id: ruleId,
      tool,
      path_glob: pathGlob,
      allow,
      description,
      persistent,
    };
    this.state.permission_rules.push(rule);
  }

  /**
   * Add a session-level permission rule (for "don't ask again" functionality)
   */
  addSessionAllowRule(toolName: string, pathOrHost?: string): void {
    const ruleId = `session_${toolName}_${Date.now()}`;
    const pathGlob = pathOrHost || "*"; // If no path/host specified, allow for all
    const description = `Session allow for ${toolName}${pathOrHost ? ` on ${pathOrHost}` : ""}`;

    const rule: PermissionRule = {
      id: ruleId,
      tool: toolName,
      path_glob: pathGlob,
      allow: true,
      description,
      persistent: false, // Session-only, not persistent
    };

    this.state.permission_rules.push(rule);
  }

  /**
   * Check if a tool is allowed for a specific path/host in this session
   */
  isSessionAllowed(toolName: string, pathOrHost: string): boolean {
    for (const rule of this.state.permission_rules) {
      if (rule.tool === toolName && rule.allow) {
        if (rule.path_glob === "*" || globMatch(rule.path_glob, pathOrHost)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get host from bash command (for network requests)
   */
  extractHostFromCommand(command: string): string | null {
    const cmd = command.toLowerCase();
    if (cmd.includes("curl ") || cmd.includes("wget ")) {
      const urlMatch = command.match(/https?:\/\/([^\/\s]+)/);
      return urlMatch ? urlMatch[1] : null;
    }
    return null;
  }
}
