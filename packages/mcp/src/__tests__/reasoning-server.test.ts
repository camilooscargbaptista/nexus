/**
 * Tests for nexus-reasoning MCP Server
 */

import { createReasoningServer } from "../reasoning-server.js";
import type { ReasoningBackend, SkillRouteResult } from "../reasoning-server.js";
import type { ArchitectureSnapshot, GuidanceResult, Domain } from "@camilooscargbaptista/nexus-types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

function makeMockSnapshot(): ArchitectureSnapshot {
  return {
    projectPath: "/test",
    projectName: "test-project",
    timestamp: new Date().toISOString(),
    score: { overall: 65, modularity: 70, coupling: 55, cohesion: 65, layering: 60 },
    layers: [],
    antiPatterns: [{
      pattern: "god_class",
      severity: "high" as any,
      location: "src/core.ts",
      description: "Class with 2000 lines",
      affectedFiles: ["src/core.ts"],
    }],
    dependencies: [],
    frameworks: ["express"],
    domain: "generic" as Domain,
    fileCount: 50,
    lineCount: 5000,
  };
}

function makeMockBackend(): ReasoningBackend {
  return {
    routeSkills: async (snapshot): Promise<SkillRouteResult[]> => [
      {
        skillName: "design-patterns",
        category: "architecture",
        priority: 1,
        reason: "God class detected — refactoring patterns applicable",
        triggeredBy: ["anti_pattern:god_class"],
      },
      {
        skillName: "adr",
        category: "architecture",
        priority: 2,
        reason: "Low coupling score — architecture decision needed",
        triggeredBy: ["score_threshold:coupling<50"],
      },
    ],
    executeGuidance: async (skillName, snapshot): Promise<GuidanceResult> => {
      if (skillName === "design-patterns") {
        return {
          skillName: "design-patterns",
          category: "architecture" as any,
          findings: [{
            id: "F001",
            severity: "high" as any,
            title: "God Class: src/core.ts",
            description: "Class exceeds 500 lines and has 15+ responsibilities",
            skillSource: "design-patterns",
            affectedFiles: ["src/core.ts"],
          }],
          recommendations: [{
            id: "R001",
            title: "Extract Service Classes",
            description: "Break src/core.ts into focused services",
            priority: "high" as any,
            effort: { hours: 16, size: "L", complexity: "high" },
            impact: { scoreImprovement: 15, riskReduction: "high" as any, businessImpact: "Reduced bug density" },
            linkedFindings: ["F001"],
          }],
          estimatedEffort: { hours: 16, size: "L", complexity: "high" },
          confidence: "high" as any,
        };
      }
      throw new Error(`Skill '${skillName}' not applicable`);
    },
  };
}

async function createConnectedPair(backend: ReasoningBackend) {
  const server = createReasoningServer(backend);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("nexus-reasoning MCP Server", () => {
  let client: Client;

  beforeAll(async () => {
    const pair = await createConnectedPair(makeMockBackend());
    client = pair.client;
  });

  it("should list 2 tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map(t => t.name);
    expect(names).toContain("routeSkills");
    expect(names).toContain("executeGuidance");
    expect(tools.tools.length).toBe(2);
  });

  it("should run routeSkills tool", async () => {
    const snapshot = makeMockSnapshot();
    const result = await client.callTool({
      name: "routeSkills",
      arguments: { snapshot: JSON.stringify(snapshot) },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.length).toBe(2);
    expect(parsed[0].skillName).toBe("design-patterns");
    expect(parsed[0].priority).toBe(1);
    expect(parsed[1].skillName).toBe("adr");
  });

  it("should run executeGuidance tool", async () => {
    const snapshot = makeMockSnapshot();
    const result = await client.callTool({
      name: "executeGuidance",
      arguments: {
        skillName: "design-patterns",
        snapshot: JSON.stringify(snapshot),
      },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.skillName).toBe("design-patterns");
    expect(parsed.findings.length).toBe(1);
    expect(parsed.recommendations.length).toBe(1);
    expect(parsed.confidence).toBe("high");
  });

  it("should handle unknown skill gracefully", async () => {
    const snapshot = makeMockSnapshot();
    const result = await client.callTool({
      name: "executeGuidance",
      arguments: {
        skillName: "nonexistent-skill",
        snapshot: JSON.stringify(snapshot),
      },
    });
    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain("not applicable");
  });

  it("should handle invalid JSON in snapshot gracefully", async () => {
    const result = await client.callTool({
      name: "routeSkills",
      arguments: { snapshot: "not valid json" },
    });
    expect(result.isError).toBe(true);
  });
});
