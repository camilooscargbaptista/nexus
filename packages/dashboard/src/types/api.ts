// ==================== Enums ====================

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type Plan = "FREE" | "PRO" | "ENTERPRISE";
export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type GateResult = "PASSED" | "FAILED" | "WARNING";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingLayer = "perception" | "validation" | "reasoning" | "autonomy";

// ==================== Core Entities ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  createdAt: string;
  memberCount?: number;
}

export interface Project {
  id: string;
  teamId: string;
  name: string;
  repoUrl?: string;
  defaultBranch: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface PipelineRun {
  id: string;
  projectId: string;
  triggeredBy: string;
  status: RunStatus;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
  architectureScore?: number;
  securityScore?: number;
  qualityGate?: GateResult;
  findingsCount: number;
  criticalCount: number;
  durationMs?: number;
  modelTier?: string;
  tokensUsed?: number;
  startedAt: string;
  completedAt?: string;
}

export interface Finding {
  id: string;
  runId: string;
  layer: FindingLayer;
  category: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  confidence: number;
  suggestion?: string;
  metadata: Record<string, unknown>;
  dismissed: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  teamId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

// ==================== Dashboard Aggregation Types ====================

export interface DashboardStats {
  totalRuns: number;
  passRate: number;
  avgArchScore: number;
  avgSecScore: number;
  totalFindings: number;
  criticalFindings: number;
  avgDurationMs: number;
  trendsData: TrendPoint[];
}

export interface TrendPoint {
  date: string;
  archScore: number;
  secScore: number;
  findings: number;
  runs: number;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface FindingsByCategory {
  category: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

// ==================== API Response Types ====================

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== Auth Types ====================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
