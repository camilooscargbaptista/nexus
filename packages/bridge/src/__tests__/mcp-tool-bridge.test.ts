/**
 * @camilooscargbaptista/nexus-bridge — MCP Tool Bridge Tests
 */

import { describe, it, expect } from "@jest/globals";
import { MCPToolBridge } from "../mcp-tool-bridge.js";
import type { MCPToolInfo } from "../mcp-tool-bridge.js";

const testTools: MCPToolInfo[] = [
  {
    name: "get_issues",
    description: "Get GitHub issues from repository",
    serverId: "github",
    serverName: "GitHub MCP",
    inputSchema: { type: "object" },
  },
  {
    name: "run_query",
    description: "Execute SQL query against database",
    serverId: "postgres",
    serverName: "Postgres MCP",
    inputSchema: { type: "object" },
  },
  {
    name: "read_file",
    description: "Read file contents from filesystem directory",
    serverId: "filesystem",
    serverName: "Filesystem MCP",
    inputSchema: { type: "object" },
  },
];

describe("MCPToolBridge", () => {
  const bridge = new MCPToolBridge();

  it("should bridge a single tool", () => {
    const skill = bridge.bridge(testTools[0]!);

    expect(skill.id).toBe("mcp:github:get_issues");
    expect(skill.name).toBe("get_issues");
    expect(skill.source).toBe("mcp");
    expect(skill.serverId).toBe("github");
  });

  it("should infer category from description", () => {
    const githubSkill = bridge.bridge(testTools[0]!);
    expect(githubSkill.category).toBe("vcs"); // "issues" + "repository" → vcs

    const dbSkill = bridge.bridge(testTools[1]!);
    expect(dbSkill.category).toBe("database"); // "sql" + "query" + "database"

    const fsSkill = bridge.bridge(testTools[2]!);
    expect(fsSkill.category).toBe("filesystem"); // "file" + "directory"
  });

  it("should generate triggers from description", () => {
    const skill = bridge.bridge(testTools[0]!);
    expect(skill.triggers).toContain("get_issues");
    expect(skill.triggers.length).toBeGreaterThan(1);
  });

  it("should bridge all tools at once", () => {
    const newBridge = new MCPToolBridge();
    const skills = newBridge.bridgeAll(testTools);
    expect(skills.length).toBe(3);
  });

  it("should find by tool name", () => {
    const found = bridge.findByToolName("get_issues");
    expect(found).toBeDefined();
    expect(found!.toolName).toBe("get_issues");
  });

  it("should find by server", () => {
    bridge.bridgeAll(testTools); // Ensure all are bridged
    const githubSkills = bridge.findByServer("github");
    expect(githubSkills.length).toBeGreaterThan(0);
  });

  it("should support custom prefix", () => {
    const customBridge = new MCPToolBridge({ idPrefix: "ext:" });
    const skill = customBridge.bridge(testTools[0]!);
    expect(skill.id).toBe("ext:github:get_issues");
  });

  it("should track count", () => {
    const freshBridge = new MCPToolBridge();
    expect(freshBridge.count).toBe(0);
    freshBridge.bridge(testTools[0]!);
    expect(freshBridge.count).toBe(1);
  });
});
