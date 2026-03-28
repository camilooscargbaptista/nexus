/**
 * nexus-perception MCP Server
 *
 * Exposes Architect analysis capabilities as MCP tools:
 *   - analyze: Full architecture analysis of a project
 *   - score: Get architecture score breakdown
 *   - forecast: Get temporal analysis + weather forecast
 *   - antiPatterns: Detect anti-patterns and pre-anti-patterns
 *
 * Transport: stdio (default) for Claude Code / Claude Desktop integration
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  ArchitectureSnapshot,
  ArchitectureScoreBreakdown,
  AntiPatternFinding,
  Domain,
} from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Pluggable analysis backend — keeps the MCP server decoupled from Architect */
export interface PerceptionBackend {
  analyze(projectPath: string): Promise<ArchitectureSnapshot>;
  score(projectPath: string): Promise<ArchitectureScoreBreakdown>;
  forecast(projectPath: string): Promise<ForecastResult>;
  antiPatterns(projectPath: string): Promise<AntiPatternResult>;
}

export interface ForecastResult {
  temporal: {
    overallTrend: string;
    overallTemporalScore: number;
    modules: Array<{
      module: string;
      trend: string;
      temporalScore: number;
      projectedScore: number;
      riskLevel: string;
    }>;
  } | null;
  forecast: {
    outlook: string;
    headline: string;
    preAntiPatterns: Array<{
      type: string;
      module: string;
      severity: string;
      weeksToThreshold: number;
      description: string;
      recommendation: string;
    }>;
    topRisks: string[];
    recommendations: string[];
  } | null;
}

export interface AntiPatternResult {
  static: AntiPatternFinding[];
  preAntiPatterns: Array<{
    type: string;
    module: string;
    severity: string;
    weeksToThreshold: number;
    description: string;
    recommendation: string;
    confidence: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// SERVER FACTORY
// ═══════════════════════════════════════════════════════════════

export function createPerceptionServer(backend: PerceptionBackend): McpServer {
  const server = new McpServer({
    name: "nexus-perception",
    version: "1.0.0",
  });

  // ── Tool: analyze ──
  server.tool(
    "analyze",
    "Full architecture analysis — returns layers, dependencies, scores, frameworks, domain detection",
    {
      projectPath: z.string().describe("Absolute path to the project to analyze"),
    },
    async ({ projectPath }) => {
      try {
        const snapshot = await backend.analyze(projectPath);
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
            text: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: score ──
  server.tool(
    "score",
    "Get architecture score breakdown — overall, modularity, coupling, cohesion, layering (0-100)",
    {
      projectPath: z.string().describe("Absolute path to the project to score"),
    },
    async ({ projectPath }) => {
      try {
        const scoreBreakdown = await backend.score(projectPath);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(scoreBreakdown, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Scoring failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: forecast ──
  server.tool(
    "forecast",
    "Architecture weather forecast — temporal trends, velocity vectors, pre-anti-pattern detection, 6-month projections. Returns outlook: sunny/cloudy/stormy",
    {
      projectPath: z.string().describe("Absolute path to the project (must be a git repository)"),
    },
    async ({ projectPath }) => {
      try {
        const result = await backend.forecast(projectPath);
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
            text: `Forecast failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: antiPatterns ──
  server.tool(
    "antiPatterns",
    "Detect current anti-patterns and emerging pre-anti-patterns (god class, shotgun surgery, bus factor risk, complexity spiral, coupling magnet)",
    {
      projectPath: z.string().describe("Absolute path to the project"),
    },
    async ({ projectPath }) => {
      try {
        const result = await backend.antiPatterns(projectPath);
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
            text: `Anti-pattern detection failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  return server;
}
