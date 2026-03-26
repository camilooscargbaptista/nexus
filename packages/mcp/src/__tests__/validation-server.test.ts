/**
 * Tests for nexus-validation MCP Server
 */

import { createValidationServer } from "../validation-server.js";
import type {
  ValidationBackend,
  ConsensusResult,
  QualityGateResult,
} from "../validation-server.js";
import type { ValidationSnapshot } from "@nexus/types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ═══════════════════════════════════════════════════════════════
// MOCK BACKEND
// ═══════════════════════════════════════════════════════════════

function makeMockValidation(): ValidationSnapshot {
  return {
    projectPath: "/test",
    timestamp: new Date().toISOString(),
    success: true,
    overallScore: 78,
    validators: [{
      name: "security",
      passed: true,
      score: 82,
      threshold: 60,
      issueCount: 2,
      topIssues: [{
        severity: "medium" as any,
        code: "SEC001",
        message: "Missing input validation",
        file: "src/api.ts",
        line: 42,
      }],
    }],
    issueCount: { critical: 0, high: 1, medium: 3, low: 5, info: 2, total: 11 },
    duration: 1500,
  };
}

function makeMockBackend(): ValidationBackend {
  return {
    validate: async () => makeMockValidation(),
    consensus: async (): Promise<ConsensusResult> => ({
      primary: makeMockValidation(),
      adversarial: { ...makeMockValidation(), overallScore: 72 },
      consensus: {
        agreedIssues: 8,
        disagreedIssues: 3,
        onlyPrimaryIssues: 2,
        onlyAdversarialIssues: 1,
        confidenceScore: 0.85,
        zones: {
          agreement: [{ severity: "medium", code: "SEC001", message: "Input validation", source: "both", confidence: 0.95 }],
          disagreement: [{ severity: "low", code: "SEC005", message: "Unused import", source: "primary-only", confidence: 0.6 }],
          uncertainty: [],
        },
      },
    }),
    qualityGate: async (_, config): Promise<QualityGateResult> => ({
      passed: true,
      score: 78,
      threshold: config?.minScore ?? 60,
      gates: [
        { name: "Overall Score", passed: true, actual: 78, expected: 60, description: "Score must be >= 60" },
        { name: "Critical Issues", passed: true, actual: 0, expected: 0, description: "Max 0 critical issues" },
      ],
      blockers: [],
    }),
  };
}

async function createConnectedPair(backend: ValidationBackend) {
  const server = createValidationServer(backend);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("nexus-validation MCP Server", () => {
  let client: Client;

  beforeAll(async () => {
    const pair = await createConnectedPair(makeMockBackend());
    client = pair.client;
  });

  it("should list 3 tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map(t => t.name);
    expect(names).toContain("validate");
    expect(names).toContain("consensus");
    expect(names).toContain("qualityGate");
    expect(tools.tools.length).toBe(3);
  });

  it("should run validate tool", async () => {
    const result = await client.callTool({
      name: "validate",
      arguments: { projectPath: "/test" },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.overallScore).toBe(78);
    expect(parsed.validators.length).toBe(1);
  });

  it("should pass optional params to validate", async () => {
    const result = await client.callTool({
      name: "validate",
      arguments: {
        projectPath: "/test",
        validators: ["security"],
        securityLevel: "strict",
      },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.success).toBe(true);
  });

  it("should run consensus tool", async () => {
    const result = await client.callTool({
      name: "consensus",
      arguments: { projectPath: "/test" },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.consensus.agreedIssues).toBe(8);
    expect(parsed.consensus.disagreedIssues).toBe(3);
    expect(parsed.consensus.confidenceScore).toBe(0.85);
    expect(parsed.consensus.zones.agreement.length).toBe(1);
  });

  it("should run qualityGate tool", async () => {
    const result = await client.callTool({
      name: "qualityGate",
      arguments: { projectPath: "/test", minScore: 60, maxCritical: 0 },
    });
    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.passed).toBe(true);
    expect(parsed.score).toBe(78);
    expect(parsed.blockers.length).toBe(0);
  });

  it("should handle backend errors gracefully", async () => {
    const failingBackend: ValidationBackend = {
      validate: async () => { throw new Error("Sentinel unavailable"); },
      consensus: async () => { throw new Error("Consensus crashed"); },
      qualityGate: async () => { throw new Error("Gate check failed"); },
    };

    const pair = await createConnectedPair(failingBackend);
    const result = await pair.client.callTool({
      name: "validate",
      arguments: { projectPath: "/bad" },
    });

    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain("Sentinel unavailable");
  });
});
