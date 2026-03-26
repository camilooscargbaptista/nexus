#!/usr/bin/env node
/**
 * nexus-perception — MCP server binary (stdio transport)
 *
 * Usage:
 *   npx nexus-perception
 *   # or in claude_desktop_config.json:
 *   { "command": "npx", "args": ["-y", "nexus-perception"] }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPerceptionServer } from "../perception-server.js";
import type { PerceptionBackend } from "../perception-server.js";

// Default backend — attempts to dynamically load @girardelli/architect
async function loadDefaultBackend(): Promise<PerceptionBackend> {
  try {
    // Dynamic import to keep architect as optional peer dep
    const architect = await import("@girardelli/architect");

    return {
      async analyze(projectPath: string) {
        const result = architect.analyze(projectPath);
        return result as any;
      },
      async score(projectPath: string) {
        const result = architect.analyze(projectPath);
        return (result as any).score;
      },
      async forecast(projectPath: string) {
        // Git history analyzers
        const { GitHistoryAnalyzer } = await import("@girardelli/architect");
        const { TemporalScorer } = await import("@girardelli/architect");
        const { ForecastEngine } = await import("@girardelli/architect");

        const gitAnalyzer = new (GitHistoryAnalyzer as any)();
        const gitReport = gitAnalyzer.analyze(projectPath);

        const scorer = new (TemporalScorer as any)();
        const staticScores = new Map<string, number>();
        const temporalReport = scorer.score(gitReport, staticScores);

        const engine = new (ForecastEngine as any)();
        const forecast = engine.forecast(gitReport, temporalReport);

        return { temporal: temporalReport, forecast };
      },
      async antiPatterns(projectPath: string) {
        const result = architect.analyze(projectPath);
        return {
          static: (result as any).antiPatterns || [],
          preAntiPatterns: [],
        };
      },
    };
  } catch {
    throw new Error(
      "Could not load @girardelli/architect. Install it: npm install @girardelli/architect"
    );
  }
}

async function main() {
  const backend = await loadDefaultBackend();
  const server = createPerceptionServer(backend);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nexus-perception failed to start:", err);
  process.exit(1);
});
