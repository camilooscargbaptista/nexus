/**
 * nexus-validation MCP Server
 *
 * Exposes Sentinel validation capabilities as MCP tools:
 *   - validate: Run full validation suite on a project
 *   - consensus: Run primary + adversarial validation with consensus engine
 *   - qualityGate: Check if project passes quality gates
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ValidationSnapshot, Severity } from "@nexus/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ValidationBackend {
  validate(projectPath: string, config?: ValidationConfig): Promise<ValidationSnapshot>;
  consensus(projectPath: string, config?: ValidationConfig): Promise<ConsensusResult>;
  qualityGate(projectPath: string, config?: QualityGateConfig): Promise<QualityGateResult>;
}

export interface ValidationConfig {
  validators?: string[];
  securityLevel?: "strict" | "moderate" | "permissive";
  excludePatterns?: string[];
}

export interface ConsensusResult {
  primary: ValidationSnapshot;
  adversarial: ValidationSnapshot;
  consensus: {
    agreedIssues: number;
    disagreedIssues: number;
    onlyPrimaryIssues: number;
    onlyAdversarialIssues: number;
    confidenceScore: number;
    zones: {
      agreement: ConsensusIssue[];
      disagreement: ConsensusIssue[];
      uncertainty: ConsensusIssue[];
    };
  };
}

export interface ConsensusIssue {
  severity: string;
  code: string;
  message: string;
  file?: string;
  line?: number;
  source: "both" | "primary-only" | "adversarial-only";
  confidence: number;
}

export interface QualityGateConfig {
  minScore?: number;
  maxCritical?: number;
  maxHigh?: number;
  securityLevel?: "strict" | "moderate" | "permissive";
}

export interface QualityGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  gates: Array<{
    name: string;
    passed: boolean;
    actual: number;
    expected: number;
    description: string;
  }>;
  blockers: string[];
}

// ═══════════════════════════════════════════════════════════════
// SERVER FACTORY
// ═══════════════════════════════════════════════════════════════

export function createValidationServer(backend: ValidationBackend): McpServer {
  const server = new McpServer({
    name: "nexus-validation",
    version: "1.0.0",
  });

  // ── Tool: validate ──
  server.tool(
    "validate",
    "Run full validation suite — security, testing, architecture, performance, accessibility, error handling, API contracts, dead code",
    {
      projectPath: z.string().describe("Absolute path to the project to validate"),
      validators: z.array(z.string()).optional().describe("Specific validators to run (default: all)"),
      securityLevel: z.enum(["strict", "moderate", "permissive"]).optional()
        .describe("Security strictness level (default: moderate)"),
    },
    async ({ projectPath, validators, securityLevel }) => {
      try {
        const config: ValidationConfig = {};
        if (validators) config.validators = validators;
        if (securityLevel) config.securityLevel = securityLevel;

        const snapshot = await backend.validate(projectPath, config);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(snapshot, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: consensus ──
  server.tool(
    "consensus",
    "Run dual validation (primary + adversarial sub-agent) with consensus engine — shows agreement, disagreement, and uncertainty zones between two independent analyses",
    {
      projectPath: z.string().describe("Absolute path to the project"),
      securityLevel: z.enum(["strict", "moderate", "permissive"]).optional()
        .describe("Security strictness level (default: moderate)"),
    },
    async ({ projectPath, securityLevel }) => {
      try {
        const config: ValidationConfig = {};
        if (securityLevel) config.securityLevel = securityLevel;

        const result = await backend.consensus(projectPath, config);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Consensus validation failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: qualityGate ──
  server.tool(
    "qualityGate",
    "Check if project passes quality gates — returns pass/fail with details on each gate (score threshold, max critical issues, security compliance)",
    {
      projectPath: z.string().describe("Absolute path to the project"),
      minScore: z.number().min(0).max(100).optional()
        .describe("Minimum overall score to pass (default: 60)"),
      maxCritical: z.number().min(0).optional()
        .describe("Maximum critical issues allowed (default: 0)"),
      maxHigh: z.number().min(0).optional()
        .describe("Maximum high-severity issues allowed (default: 5)"),
    },
    async ({ projectPath, minScore, maxCritical, maxHigh }) => {
      try {
        const config: QualityGateConfig = {};
        if (minScore !== undefined) config.minScore = minScore;
        if (maxCritical !== undefined) config.maxCritical = maxCritical;
        if (maxHigh !== undefined) config.maxHigh = maxHigh;

        const result = await backend.qualityGate(projectPath, config);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Quality gate check failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  return server;
}
