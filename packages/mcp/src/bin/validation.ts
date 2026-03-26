#!/usr/bin/env node
/**
 * nexus-validation — MCP server binary (stdio transport)
 *
 * Usage:
 *   npx nexus-validation
 *   # or in claude_desktop_config.json:
 *   { "command": "npx", "args": ["-y", "nexus-validation"] }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createValidationServer } from "../validation-server.js";
import type { ValidationBackend } from "../validation-server.js";

async function loadDefaultBackend(): Promise<ValidationBackend> {
  try {
    const sentinel = await import("sentinel-method");

    return {
      async validate(projectPath, config) {
        const result = (sentinel as any).validate(projectPath, config);
        return result;
      },
      async consensus(projectPath, config) {
        // Uses primary + adversarial verifier + consensus engine
        const result = (sentinel as any).validateWithConsensus?.(projectPath, config);
        if (!result) {
          throw new Error("Consensus validation requires sentinel-method >= 3.0.0 with sub-agent verification");
        }
        return result;
      },
      async qualityGate(projectPath, config) {
        const validation = (sentinel as any).validate(projectPath, {});
        const score = validation.overallScore ?? 0;
        const threshold = config?.minScore ?? 60;
        const maxCritical = config?.maxCritical ?? 0;
        const maxHigh = config?.maxHigh ?? 5;

        const criticalCount = validation.issueCount?.critical ?? 0;
        const highCount = validation.issueCount?.high ?? 0;

        const gates = [
          {
            name: "Overall Score",
            passed: score >= threshold,
            actual: score,
            expected: threshold,
            description: `Score must be >= ${threshold}`,
          },
          {
            name: "Critical Issues",
            passed: criticalCount <= maxCritical,
            actual: criticalCount,
            expected: maxCritical,
            description: `Max ${maxCritical} critical issue(s) allowed`,
          },
          {
            name: "High Issues",
            passed: highCount <= maxHigh,
            actual: highCount,
            expected: maxHigh,
            description: `Max ${maxHigh} high-severity issue(s) allowed`,
          },
        ];

        const blockers = gates.filter(g => !g.passed).map(g => g.description);

        return {
          passed: blockers.length === 0,
          score,
          threshold,
          gates,
          blockers,
        };
      },
    };
  } catch {
    throw new Error(
      "Could not load sentinel-method. Install it: npm install sentinel-method"
    );
  }
}

async function main() {
  const backend = await loadDefaultBackend();
  const server = createValidationServer(backend);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nexus-validation failed to start:", err);
  process.exit(1);
});
