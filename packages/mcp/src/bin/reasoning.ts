#!/usr/bin/env node
/**
 * nexus-reasoning — MCP server binary (stdio transport)
 *
 * Usage:
 *   npx nexus-reasoning
 *   # or in claude_desktop_config.json:
 *   { "command": "npx", "args": ["-y", "nexus-reasoning"] }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createReasoningServer } from "../reasoning-server.js";
import type { ReasoningBackend } from "../reasoning-server.js";

async function loadDefaultBackend(): Promise<ReasoningBackend> {
  // The reasoning backend wraps ToolkitRouter from @camilooscargbaptista/nexus-bridge
  // For standalone use, it provides a simplified routing mechanism
  return {
    async routeSkills(snapshot) {
      try {
        const bridge = await import("@camilooscargbaptista/nexus-bridge");
        const { NexusEventBus } = await import("@camilooscargbaptista/nexus-events");

        const eventBus = new NexusEventBus();
        const router = new bridge.ToolkitRouter(eventBus);
        const results = await router.route(snapshot);

        return results.map((r: any) => ({
          skillName: r.skillName,
          category: r.category,
          priority: r.findings?.length ?? 0,
          reason: r.findings?.[0]?.description ?? "Triggered by analysis",
          triggeredBy: r.findings?.map((f: any) => f.skillSource) ?? [],
        }));
      } catch {
        throw new Error(
          "Could not load @camilooscargbaptista/nexus-bridge. Ensure the nexus monorepo is built."
        );
      }
    },
    async executeGuidance(skillName, snapshot) {
      try {
        const bridge = await import("@camilooscargbaptista/nexus-bridge");
        const { NexusEventBus } = await import("@camilooscargbaptista/nexus-events");

        const eventBus = new NexusEventBus();
        const router = new bridge.ToolkitRouter(eventBus);
        const allResults = await router.route(snapshot);

        const result = allResults.find((r: any) => r.skillName === skillName);
        if (!result) {
          throw new Error(
            `Skill '${skillName}' not applicable to this snapshot. ` +
            `Available: ${allResults.map((r: any) => r.skillName).join(", ")}`
          );
        }
        return result;
      } catch (error) {
        if (error instanceof Error && error.message.includes("Skill '")) {
          throw error;
        }
        throw new Error(
          "Could not load @camilooscargbaptista/nexus-bridge. Ensure the nexus monorepo is built."
        );
      }
    },
  };
}

async function main() {
  const backend = await loadDefaultBackend();
  const server = createReasoningServer(backend);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nexus-reasoning failed to start:", err);
  process.exit(1);
});
