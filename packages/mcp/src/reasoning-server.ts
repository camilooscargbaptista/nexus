/**
 * nexus-reasoning MCP Server
 *
 * Exposes CTO Toolkit routing and skill execution as MCP tools:
 *   - routeSkills: Given an architecture snapshot, return applicable skills
 *   - executeGuidance: Run a specific skill and return guidance
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  ArchitectureSnapshot,
  GuidanceResult,
  SkillCategory,
} from "@nexus/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ReasoningBackend {
  routeSkills(snapshot: ArchitectureSnapshot): Promise<SkillRouteResult[]>;
  executeGuidance(
    skillName: string,
    snapshot: ArchitectureSnapshot,
  ): Promise<GuidanceResult>;
}

export interface SkillRouteResult {
  skillName: string;
  category: string;
  priority: number;
  reason: string;
  triggeredBy: string[];
}

// ═══════════════════════════════════════════════════════════════
// SERVER FACTORY
// ═══════════════════════════════════════════════════════════════

export function createReasoningServer(backend: ReasoningBackend): McpServer {
  const server = new McpServer({
    name: "nexus-reasoning",
    version: "1.0.0",
  });

  // ── Tool: routeSkills ──
  server.tool(
    "routeSkills",
    "Given an architecture analysis, determine which CTO Toolkit skills should be activated — returns prioritized list of applicable skills with reasons",
    {
      snapshot: z.string().describe("JSON string of an ArchitectureSnapshot (from the 'analyze' tool)"),
    },
    async ({ snapshot: snapshotJson }) => {
      try {
        const snapshot: ArchitectureSnapshot = JSON.parse(snapshotJson);
        const routes = await backend.routeSkills(snapshot);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(routes, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Skill routing failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: executeGuidance ──
  server.tool(
    "executeGuidance",
    "Execute a specific CTO Toolkit skill against an architecture snapshot — returns findings, recommendations, and effort estimates",
    {
      skillName: z.string().describe("Name of the skill to execute (e.g., 'design-patterns', 'adr', 'security-hardening')"),
      snapshot: z.string().describe("JSON string of an ArchitectureSnapshot"),
    },
    async ({ skillName, snapshot: snapshotJson }) => {
      try {
        const snapshot: ArchitectureSnapshot = JSON.parse(snapshotJson);
        const guidance = await backend.executeGuidance(skillName, snapshot);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(guidance, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Guidance execution failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  return server;
}
