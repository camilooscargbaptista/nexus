import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { NexusApiClient, createApiClient, isApiError, isApiSuccess } from "../lib/api-client";
import {
  ApiResult,
  ApiResponse,
  ApiError,
  AuthResponse,
  User,
  Project,
  PipelineRun,
  Finding,
  DashboardStats,
  FindingsByCategory,
  PaginatedResponse,
} from "../types";

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe("NexusApiClient", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    process.env.REACT_APP_API_URL = "http://localhost:3000";
  });

  describe("constructor", () => {
    it("should set baseUrl from parameter", () => {
      const client = new NexusApiClient("http://api.example.com");
      expect(client["baseUrl"]).toBe("http://api.example.com");
    });

    it("should remove trailing slash from baseUrl", () => {
      const client = new NexusApiClient("http://api.example.com/");
      expect(client["baseUrl"]).toBe("http://api.example.com");
    });

    it("should set token from parameter", () => {
      const client = new NexusApiClient("http://localhost:3000", "test-token");
      expect(client.getToken()).toBe("test-token");
    });

    it("should use default baseUrl when not provided", () => {
      const client = new NexusApiClient();
      expect(client["baseUrl"]).toBe("http://localhost:3000");
    });
  });

  describe("setToken", () => {
    it("should update the token", () => {
      const client = new NexusApiClient();
      client.setToken("new-token");
      expect(client.getToken()).toBe("new-token");
    });

    it("should allow setting token after construction", () => {
      const client = new NexusApiClient("http://localhost:3000");
      expect(client.getToken()).toBeUndefined();
      client.setToken("auth-token");
      expect(client.getToken()).toBe("auth-token");
    });
  });

  describe("getToken", () => {
    it("should return token if set", () => {
      const client = new NexusApiClient("http://localhost:3000", "my-token");
      expect(client.getToken()).toBe("my-token");
    });

    it("should return undefined if not set", () => {
      const client = new NexusApiClient();
      expect(client.getToken()).toBeUndefined();
    });
  });

  describe("isAuthenticated", () => {
    it("should return true when token is set", () => {
      const client = new NexusApiClient("http://localhost:3000", "token");
      expect(client.isAuthenticated()).toBe(true);
    });

    it("should return false when token is not set", () => {
      const client = new NexusApiClient();
      expect(client.isAuthenticated()).toBe(false);
    });
  });

  describe("login", () => {
    it("should call POST /auth/login with correct body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          token: "auth-token",
          user: {
            id: "user-1",
            email: "test@example.com",
            name: "Test User",
            role: "OWNER",
            createdAt: "2026-01-01T00:00:00Z",
          },
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.login({ email: "test@example.com", password: "password" });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "password" }),
      });

      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.token).toBe("auth-token");
        expect(result.data.user.email).toBe("test@example.com");
      }
    });

    it("should return error on 401 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Invalid credentials" }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.login({ email: "test@example.com", password: "wrong" });

      expect(isApiError(result)).toBe(true);
      if (isApiError(result)) {
        expect(result.error.code).toBe("401");
        expect(result.error.message).toBe("Invalid credentials");
      }
    });
  });

  describe("register", () => {
    it("should call POST /auth/register with correct body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          token: "new-token",
          user: {
            id: "user-2",
            email: "newuser@example.com",
            name: "New User",
            role: "MEMBER",
            createdAt: "2026-03-26T00:00:00Z",
          },
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.register({
        email: "newuser@example.com",
        name: "New User",
        password: "password",
      });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          name: "New User",
          password: "password",
        }),
      });

      expect(isApiSuccess(result)).toBe(true);
    });
  });

  describe("getProfile", () => {
    it("should call GET /auth/profile with auth header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          role: "OWNER",
          createdAt: "2026-01-01T00:00:00Z",
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000", "test-token");
      const result = await client.getProfile();

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/auth/profile", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
      });

      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.email).toBe("test@example.com");
      }
    });
  });

  describe("listProjects", () => {
    it("should call GET with teamId and pagination params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.listProjects("team-1", 2, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/teams/team-1/projects?"),
        expect.any(Object)
      );

      const callUrl = (mockFetch.mock.calls[0][0] as string).toLowerCase();
      expect(callUrl).toContain("page=2");
      expect(callUrl).toContain("pagesize=50");
    });
  });

  describe("createProject", () => {
    it("should call POST with correct body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "project-1",
          teamId: "team-1",
          name: "My Project",
          defaultBranch: "main",
          settings: {},
          createdAt: "2026-03-26T00:00:00Z",
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.createProject("team-1", {
        name: "My Project",
        repoUrl: "https://github.com/example/repo",
      });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/teams/team-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My Project",
          repoUrl: "https://github.com/example/repo",
        }),
      });

      expect(isApiSuccess(result)).toBe(true);
    });
  });

  describe("listRuns", () => {
    it("should call GET with projectId and pagination params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.listRuns("project-1", 1, 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/project-1/runs?"),
        expect.any(Object)
      );
    });
  });

  describe("getRun", () => {
    it("should call GET with correct path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "run-1",
          projectId: "project-1",
          triggeredBy: "user-1",
          status: "COMPLETED",
          findingsCount: 5,
          criticalCount: 1,
          startedAt: "2026-03-26T00:00:00Z",
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.getRun("run-1");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/runs/run-1", expect.any(Object));
    });
  });

  describe("getRunFindings", () => {
    it("should call GET with correct path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.getRunFindings("run-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/runs/run-1/findings",
        expect.any(Object)
      );
    });
  });

  describe("getDashboardStats", () => {
    it("should call GET with days param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          totalRuns: 100,
          passRate: 85,
          avgArchScore: 80,
          avgSecScore: 85,
          totalFindings: 15,
          criticalFindings: 2,
          avgDurationMs: 45000,
          trendsData: [],
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.getDashboardStats("project-1", 7);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("/projects/project-1/stats?");
      expect(callUrl).toContain("days=7");
    });

    it("should use default 30 days", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          totalRuns: 0,
          passRate: 0,
          avgArchScore: 0,
          avgSecScore: 0,
          totalFindings: 0,
          criticalFindings: 0,
          avgDurationMs: 0,
          trendsData: [],
        }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.getDashboardStats("project-1");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("days=30");
    });
  });

  describe("getFindingsByCategory", () => {
    it("should call GET with days param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.getFindingsByCategory("project-1", 14);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("/projects/project-1/findings/by-category?");
      expect(callUrl).toContain("days=14");
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.login({ email: "test@example.com", password: "password" });

      expect(isApiError(result)).toBe(true);
      if (isApiError(result)) {
        expect(result.error.code).toBe("NETWORK_ERROR");
        expect(result.error.message).toContain("Network timeout");
      }
    });

    it("should handle 401 Unauthorized with custom message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Session expired" }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.login({ email: "test@example.com", password: "password" });

      expect(isApiError(result)).toBe(true);
      if (isApiError(result)) {
        expect(result.error.code).toBe("401");
        expect(result.error.message).toBe("Session expired");
      }
    });

    it("should handle 404 Not Found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Project not found" }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.getProject("nonexistent");

      expect(isApiError(result)).toBe(true);
      if (isApiError(result)) {
        expect(result.error.code).toBe("404");
      }
    });

    it("should handle non-JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/plain" }),
        json: async () => {
          throw new Error("Not JSON");
        },
        text: async () => "HTML response",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.getProfile();

      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data).toBe("HTML response");
      }
    });

    it("should handle 500 Internal Server Error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Database connection failed" }),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      const result = await client.getDashboardStats("project-1");

      expect(isApiError(result)).toBe(true);
      if (isApiError(result)) {
        expect(result.error.code).toBe("500");
        expect(result.error.message).toBe("Database connection failed");
      }
    });
  });

  describe("authentication header", () => {
    it("should include Authorization header when token is set", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000", "secret-token");
      await client.getProfile();

      const callOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callOptions.headers).toHaveProperty("Authorization", "Bearer secret-token");
    });

    it("should not include Authorization header when token is not set", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
        text: async () => "",
      } as any);

      const client = new NexusApiClient("http://localhost:3000");
      await client.login({ email: "test@example.com", password: "password" });

      const callOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callOptions.headers).not.toHaveProperty("Authorization");
    });
  });
});

describe("isApiError", () => {
  it("should return true for ApiError", () => {
    const error: ApiError = {
      error: { message: "Error", code: "500" },
    };
    expect(isApiError(error)).toBe(true);
  });

  it("should return false for ApiResponse", () => {
    const response: ApiResponse<string> = {
      data: "success",
    };
    expect(isApiError(response)).toBe(false);
  });
});

describe("isApiSuccess", () => {
  it("should return true for ApiResponse", () => {
    const response: ApiResponse<string> = {
      data: "success",
    };
    expect(isApiSuccess(response)).toBe(true);
  });

  it("should return false for ApiError", () => {
    const error: ApiError = {
      error: { message: "Error", code: "500" },
    };
    expect(isApiSuccess(error)).toBe(false);
  });
});

describe("createApiClient", () => {
  it("should create client with provided baseUrl", () => {
    const client = createApiClient("http://api.example.com");
    expect(client["baseUrl"]).toBe("http://api.example.com");
  });

  it("should create client with default baseUrl", () => {
    const client = createApiClient();
    expect(client["baseUrl"]).toBe("http://localhost:3000");
  });

  it("should return NexusApiClient instance", () => {
    const client = createApiClient();
    expect(client).toBeInstanceOf(NexusApiClient);
  });
});
