/**
 * Permission Engine Types
 * Ported from src/codin/agent/permission_engine.py
 */

import type { SessionState, Todo, ToolExecution } from "./agent";

/**
 * Permission Decision enum - matches Python PermissionDecision
 */
export enum PermissionDecision {
  ALLOW = "allow",
  DENY = "deny",
  PROMPT = "prompt",
}

/**
 * Risk Level enum - matches Python RiskLevel
 * Note: Python has typo 'CRTICIAL' - we use 'CRITICAL' but handle compatibility
 */
export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Python uses typo 'CRTICIAL' - for compatibility with existing sessions
 */
export const RISK_LEVEL_PYTHON_TYPO = "CRTICIAL" as const;

/**
 * Permission Request interface - matches Python PermissionRequest dataclass
 */
export interface PermissionRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  affected_files: string[];
  risk_level: RiskLevel;
  diff_preview?: string;
}

/**
 * Approval callback type - supports both sync and async callbacks
 */
export type ApprovalCallback = (
  request: PermissionRequest,
) => PermissionDecision | Promise<PermissionDecision>;

/**
 * Convert Python's typo'd risk level to correct enum value
 */
export function normalizeRiskLevel(level: string): RiskLevel {
  if (level === RISK_LEVEL_PYTHON_TYPO) {
    return RiskLevel.CRITICAL;
  }
  if (Object.values(RiskLevel).includes(level as RiskLevel)) {
    return level as RiskLevel;
  }
  return RiskLevel.LOW;
}
