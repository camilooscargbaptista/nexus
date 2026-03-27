import {
  ApiResult,
  ApiResponse,
  ApiError,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Project,
  PaginatedResponse,
  PipelineRun,
  Finding,
  DashboardStats,
  FindingsByCategory,
  Team,
} from "../types";

export class NexusApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string = process.env.REACT_APP_API_URL || "http://localhost:3000", token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.token = token;
  }

  /**
   * Set the authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | undefined {
    return this.token;
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  // ==================== Auth Methods ====================

  /**
   * Login with email and password
   */
  async login(req: LoginRequest): Promise<ApiResult<AuthResponse>> {
    return this.request<AuthResponse>("POST", "/auth/login", req);
  }

  /**
   * Register a new account
   */
  async register(req: RegisterRequest): Promise<ApiResult<AuthResponse>> {
    return this.request<AuthResponse>("POST", "/auth/register", req);
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResult<User>> {
    return this.request<User>("GET", "/auth/profile");
  }

  // ==================== Project Methods ====================

  /**
   * List projects for a team
   */
  async listProjects(teamId: string, page: number = 1, pageSize: number = 20): Promise<ApiResult<PaginatedResponse<Project>>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<PaginatedResponse<Project>>("GET", `/teams/${teamId}/projects?${query}`);
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<ApiResult<Project>> {
    return this.request<Project>("GET", `/projects/${id}`);
  }

  /**
   * Create a new project
   */
  async createProject(teamId: string, data: { name: string; repoUrl?: string }): Promise<ApiResult<Project>> {
    return this.request<Project>("POST", `/teams/${teamId}/projects`, data);
  }

  /**
   * Trigger a pipeline analysis for a project
   */
  async triggerAnalysis(projectId: string, opts?: { branch?: string; projectPath?: string }): Promise<ApiResult<{
    runId: string;
    pipelineId: string;
    overallScore: number;
    scores: { perception: number; reasoning: number; validation: number };
    qualityGate: string;
    findingsCount: number;
    criticalCount: number;
    durationMs: number;
  }>> {
    return this.request("POST", `/projects/${projectId}/analyze`, opts ?? {});
  }

  // ==================== Run Methods ====================

  /**
   * List pipeline runs for a project
   */
  async listRuns(projectId: string, page: number = 1, pageSize: number = 20): Promise<ApiResult<PaginatedResponse<PipelineRun>>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<PaginatedResponse<PipelineRun>>("GET", `/projects/${projectId}/runs?${query}`);
  }

  /**
   * Get a single run by ID
   */
  async getRun(id: string): Promise<ApiResult<PipelineRun>> {
    return this.request<PipelineRun>("GET", `/runs/${id}`);
  }

  /**
   * Get findings for a specific run
   */
  async getRunFindings(runId: string): Promise<ApiResult<Finding[]>> {
    return this.request<Finding[]>("GET", `/runs/${runId}/findings`);
  }

  // ==================== Dashboard Methods ====================

  /**
   * Get dashboard statistics for a project
   */
  async getDashboardStats(projectId: string, days: number = 30): Promise<ApiResult<DashboardStats>> {
    const query = new URLSearchParams({ days: String(days) });
    return this.request<DashboardStats>("GET", `/projects/${projectId}/stats?${query}`);
  }

  /**
   * Get findings grouped by category
   */
  async getFindingsByCategory(projectId: string, days: number = 30): Promise<ApiResult<FindingsByCategory[]>> {
    const query = new URLSearchParams({ days: String(days) });
    return this.request<FindingsByCategory[]>("GET", `/projects/${projectId}/findings/by-category?${query}`);
  }

  // ==================== Team Methods ====================

  /**
   * Get team information
   */
  async getTeam(id: string): Promise<ApiResult<Team>> {
    return this.request<Team>("GET", `/teams/${id}`);
  }

  /**
   * List team members
   */
  async listTeamMembers(
    teamId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<ApiResult<PaginatedResponse<{ user: User; role: string; joinedAt: string }>>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<PaginatedResponse<{ user: User; role: string; joinedAt: string }>>("GET", `/teams/${teamId}/members?${query}`);
  }

  // ==================== Private Methods ====================

  /**
   * Generic request method handling all HTTP communication
   * @param method HTTP method
   * @param path API path (without base URL)
   * @param body Optional request body
   * @returns Promise with ApiResult wrapper
   */
  private async request<T>(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", path: string, body?: unknown): Promise<ApiResult<T>> {
    try {
      const url = `${this.baseUrl}${path}`;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // Parse response body
      let data: unknown;
      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text || null;
      }

      // Handle HTTP errors
      if (!response.ok) {
        const error: ApiError = {
          error: {
            message: typeof data === "object" && data !== null && "message" in data ? (data as Record<string, unknown>).message as string : response.statusText || "Unknown error",
            code: String(response.status),
          },
        };
        return error;
      }

      // Handle success response
      const success: ApiResponse<T> = {
        data: data as T,
      };
      return success;
    } catch (err) {
      const error: ApiError = {
        error: {
          message: err instanceof Error ? err.message : "Network error",
          code: "NETWORK_ERROR",
        },
      };
      return error;
    }
  }
}

/**
 * Factory function to create a configured API client
 * @param baseUrl Optional base URL (defaults to environment variable or localhost)
 * @returns NexusApiClient instance
 */
export function createApiClient(baseUrl?: string): NexusApiClient {
  const token = typeof window !== "undefined" ? localStorage.getItem("nexus_token") || undefined : undefined;
  return new NexusApiClient(baseUrl, token);
}

/**
 * Check if response is an error
 */
export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return "error" in result && result.error !== undefined;
}

/**
 * Check if response is successful
 */
export function isApiSuccess<T>(result: ApiResult<T>): result is ApiResponse<T> {
  return "data" in result && result.data !== undefined;
}
