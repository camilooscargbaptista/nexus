/**
 * Tests for nexus-perception MCP Server
 */

import { createPerceptionServer } from "../perception-server.js";
import type { PerceptionBackend, ForecastResult, AntiPatternResult } from "../perception-server.js";
import type { ArchitectureSnapshot, ArchitectureScoreBreakdown, Domain } from "@nexus/types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ═══════════════════════════════════════════════════════════════
// MOCK BACKEND
// ═══════════════════════════════════════════════════════════════

function makeMockSnapshot(): ArchitectureSnapshot {
  return {
    projectPath: "/test",
    projectName: "test-project",
    timestamp: new Date().toISOString(),
    score: { overall: 75, modularity: 80, coupling: 70, cohesion: 75, layering: 72 },
    layers: [{ name: "api", type: "api", fileCount: 5, files: ["routes.ts"] }],
    antiPatterns: [{
      pattern: "god_class",
      severity: "high" as any,
      location: "src/core.ts",
      description: "Class too large",
      affectedFiles: ["src/core.ts"],
    }],
    dependencies: [],
    frameworks: ["express"],
    domain: "generic" as Domain,
    fileCount: 50,
    lineCount: 5000,
  };
}

function makeMockBackend(): PerceptionBackend {
  return {
    analyze: async (path: string) => makeMockSnapshot(),
    score: async (path: string) => makeMockSnapshot().score,
    forecast: async (path: string): Promise<ForecastResult> => ({
      temporal: {
        overallTrend: "stable",
        overallTemporalScore: 72,
        modules: [{ module: "src", trend: "stable", temporalScore: 70, projectedScore: 68, riskLevel: "medium" }],
      },
      forecast: {
        outlook: "cloudy",
        headline: "1 emerging concern",
        preAntiPatterns: [{
          type: "emerging-god-class",
          module: "src",
          severity: "warning",
          weeksToThreshold: 12,
          description: "Growing fast",
          recommendation: "Split",
        }],
        topRisks: ["God class risk"],
        recommendations: ["Split src/core.ts"],
      },
    }),
    antiPatterns: async (path: string): Promise<AntiPatternResult> => ({
      static: makeMockSnapshot().antiPatterns,
      preAntiPatterns: [{
        type: "emerging-god-class",
        module: "src",
        severity: "warning",
        weeksToThreshold: 12,
        description: "Growing fast",
        recommendation: "Split",
        confidence: 0.75,
      }],
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function createConnectedPair(backend: PerceptionBackend) {
  const server = createPerceptionServer(backend);
  const client = new Client({ name: "test-client", version: "1.0.0" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("nexus-perception MCP Server", () => {
  let client: Client;

  beforeAll(async () => {
    const pair = await createConnectedPair(makeMockBackend());
    client = pair.client;
  });

  it("should list 4 tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map(t => t.name);
    expect(names).toContain("analyze");
    expect(names).toContain("score");
    expect(names).toContain("forecast");
    expect(names).toContain("antiPatterns");
    expect(tools.tools.length).toBe(4);
  });

  it("should run analyze tool", async () => {
    const result = await client.callTool({
      name: "analyze",
      arguments: { projectPath: "/test" },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.projectPath).toBe("/test");
    expect(parsed.score.overall).toBe(75);
    expect(parsed.frameworks).toContain("express");
  });

  it("should run score tool", async () => {
    const result = await client.callTool({
      name: "score",
      arguments: { projectPath: "/test" },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.overall).toBe(75);
    expect(parsed.modularity).toBe(80);
  });

  it("should run forecast tool", async () => {
    const result = await client.callTool({
      name: "forecast",
      arguments: { projectPath: "/test" },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.temporal.overallTrend).toBe("stable");
    expect(parsed.forecast.outlook).toBe("cloudy");
    expect(parsed.forecast.preAntiPatterns.length).toBe(1);
  });

  it("should run antiPatterns tool", async () => {
    const result = await client.callTool({
      name: "antiPatterns",
      arguments: { projectPath: "/test" },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.static.length).toBe(1);
    expect(parsed.preAntiPatterns.length).toBe(1);
    expect(parsed.preAntiPatterns[0].type).toBe("emerging-god-class");
  });

  it("should handle backend errors gracefully", async () => {
    const failingBackend: PerceptionBackend = {
      analyze: async () => { throw new Error("Analysis crashed"); },
      score: async () => { throw new Error("Score crashed"); },
      forecast: async () => { throw new Error("Forecast crashed"); },
      antiPatterns: async () => { throw new Error("Anti-pattern crashed"); },
    };

    const pair = await createConnectedPair(failingBackend);
    const result = await pair.client.callTool({
      name: "analyze",
      arguments: { projectPath: "/bad" },
    });

    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain("Analysis crashed");
  });
});
