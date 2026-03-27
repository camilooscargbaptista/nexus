/**
 * @nexus/mcp — MCP Client + Discovery Tests
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { MCPClient } from "../mcp-client.js";
import { MCPDiscovery } from "../mcp-discovery.js";
import type { MCPServerConfig, MCPTool } from "../mcp-client.js";

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════

const testServer: MCPServerConfig = {
  id: "test-server",
  name: "Test MCP Server",
  transport: "stdio",
  command: "echo",
};

const mockTools: MCPTool[] = [
  { name: "get_issues", description: "Get GitHub issues from repository", inputSchema: { type: "object" } },
  { name: "search_code", description: "Search code in repository", inputSchema: { type: "object" } },
  { name: "create_branch", description: "Create a new git branch", inputSchema: { type: "object" } },
];

// ═══════════════════════════════════════════════════════════════
// MCP CLIENT
// ═══════════════════════════════════════════════════════════════

describe("MCPClient", () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient(testServer);
  });

  it("should connect and disconnect", async () => {
    expect(client.isConnected).toBe(false);
    await client.connect();
    expect(client.isConnected).toBe(true);
    await client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it("should list tools via transport", async () => {
    client.setTransport(async (req) => {
      if (req.method === "tools/list") {
        return { jsonrpc: "2.0", id: req.id, result: { tools: mockTools } };
      }
      return { jsonrpc: "2.0", id: req.id, result: null };
    });

    const tools = await client.listTools();
    expect(tools.length).toBe(3);
    expect(tools[0]!.name).toBe("get_issues");
  });

  it("should cache tools after first list", async () => {
    let callCount = 0;
    client.setTransport(async (req) => {
      callCount++;
      return { jsonrpc: "2.0", id: req.id, result: { tools: mockTools } };
    });

    await client.listTools();
    await client.listTools();
    expect(callCount).toBe(1); // Only called transport once
  });

  it("should call tool successfully", async () => {
    client.setTransport(async (req) => {
      if (req.method === "tools/call") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: "Issue #1: Bug fix" }] },
        };
      }
      return { jsonrpc: "2.0", id: req.id, result: null };
    });

    const result = await client.callTool("get_issues", { repo: "nexus" });
    expect(result.content[0]!.text).toContain("Issue #1");
    expect(result.isError).toBeUndefined();
  });

  it("should handle error responses", async () => {
    client.setTransport(async (req) => ({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -1, message: "Server error" },
    }));

    const result = await client.callTool("bad_tool");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Server error");
  });

  it("should retry on transport failure", async () => {
    let attempts = 0;
    client.setTransport(async (req) => {
      attempts++;
      if (attempts < 3) throw new Error("Connection failed");
      return { jsonrpc: "2.0", id: req.id, result: { tools: [] } };
    });

    const tools = await client.listTools();
    expect(attempts).toBe(3);
    expect(tools).toBeDefined();
  });

  it("should expose server info", () => {
    expect(client.serverInfo.id).toBe("test-server");
    expect(client.serverInfo.name).toBe("Test MCP Server");
  });
});

// ═══════════════════════════════════════════════════════════════
// MCP DISCOVERY
// ═══════════════════════════════════════════════════════════════

describe("MCPDiscovery", () => {
  it("should register and auto-connect server", async () => {
    const discovery = new MCPDiscovery();
    const server = await discovery.register(testServer);

    expect(server.status).toBe("connected");
    expect(discovery.serverCount).toBe(1);
  });

  it("should aggregate tools from multiple servers", async () => {
    const discovery = new MCPDiscovery();

    // Server 1
    const server1 = await discovery.register({ ...testServer, id: "s1", name: "Server 1" });
    // Inject tools manually via client transport
    server1.client.setTransport(async (req) => ({
      jsonrpc: "2.0",
      id: req.id,
      result: { tools: [mockTools[0]!] },
    }));
    server1.tools = [mockTools[0]!];

    // Server 2
    const server2 = await discovery.register({ ...testServer, id: "s2", name: "Server 2" });
    server2.client.setTransport(async (req) => ({
      jsonrpc: "2.0",
      id: req.id,
      result: { tools: [mockTools[1]!] },
    }));
    server2.tools = [mockTools[1]!];

    const allTools = discovery.getAllTools();
    expect(allTools.length).toBe(2);
  });

  it("should find tool by name", async () => {
    const discovery = new MCPDiscovery();
    const server = await discovery.register(testServer);
    server.tools = mockTools;

    const found = discovery.findTool("search_code");
    expect(found).toBeDefined();
    expect(found!.tool.name).toBe("search_code");
  });

  it("should return undefined for unknown tool", async () => {
    const discovery = new MCPDiscovery();
    await discovery.register(testServer);

    const found = discovery.findTool("nonexistent");
    expect(found).toBeUndefined();
  });

  it("should track connected servers", async () => {
    const discovery = new MCPDiscovery();
    await discovery.register({ ...testServer, id: "s1" });
    await discovery.register({ ...testServer, id: "s2" });

    expect(discovery.connectedServers.length).toBe(2);
  });

  it("should disconnect all servers", async () => {
    const discovery = new MCPDiscovery();
    await discovery.register({ ...testServer, id: "s1" });
    await discovery.register({ ...testServer, id: "s2" });

    await discovery.disconnectAll();
    expect(discovery.connectedServers.length).toBe(0);
  });

  it("should register multiple servers at once", async () => {
    const discovery = new MCPDiscovery();
    const results = await discovery.registerAll([
      { ...testServer, id: "a" },
      { ...testServer, id: "b" },
      { ...testServer, id: "c" },
    ]);

    expect(results.length).toBe(3);
    expect(discovery.serverCount).toBe(3);
  });
});
