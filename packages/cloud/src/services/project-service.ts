/**
 * ProjectService — manages projects and pipeline runs
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { AppError } from "../middleware/error-handler.js";

export interface ProjectRepository {
  findById(id: string): Promise<ProjectRecord | null>;
  findByTeam(teamId: string): Promise<ProjectRecord[]>;
  create(data: CreateProjectData): Promise<ProjectRecord>;
  update(id: string, data: Partial<ProjectRecord>): Promise<ProjectRecord>;
  delete(id: string): Promise<void>;
}

export interface RunRepository {
  findById(id: string): Promise<RunRecord | null>;
  findByProject(projectId: string, opts?: { limit?: number; offset?: number }): Promise<RunRecord[]>;
  create(data: CreateRunData): Promise<RunRecord>;
  update(id: string, data: Partial<RunRecord>): Promise<RunRecord>;
  getStats(projectId: string): Promise<ProjectStats>;
}

export interface ProjectRecord {
  id: string;
  teamId: string;
  name: string;
  repoUrl?: string;
  defaultBranch: string;
  settings: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateProjectData {
  teamId: string;
  name: string;
  repoUrl?: string;
  defaultBranch?: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  triggeredBy: string;
  status: string;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
  architectureScore?: number;
  securityScore?: number;
  qualityGate?: string;
  findingsCount: number;
  criticalCount: number;
  durationMs?: number;
  modelTier?: string;
  tokensUsed?: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface CreateRunData {
  projectId: string;
  triggeredBy: string;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
}

export interface ProjectStats {
  totalRuns: number;
  avgArchitectureScore: number;
  avgSecurityScore: number;
  passRate: number;
  totalFindings: number;
  avgDurationMs: number;
}

export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly runs: RunRepository,
  ) {}

  async createProject(data: CreateProjectData): Promise<ProjectRecord> {
    return this.projects.create(data);
  }

  async getProject(id: string): Promise<ProjectRecord> {
    const project = await this.projects.findById(id);
    if (!project) throw AppError.notFound("Project");
    return project;
  }

  async listProjects(teamId: string): Promise<ProjectRecord[]> {
    return this.projects.findByTeam(teamId);
  }

  async updateProject(id: string, data: Partial<ProjectRecord>): Promise<ProjectRecord> {
    await this.getProject(id); // ensure exists
    return this.projects.update(id, data);
  }

  async deleteProject(id: string): Promise<void> {
    await this.getProject(id);
    return this.projects.delete(id);
  }

  async createRun(data: CreateRunData): Promise<RunRecord> {
    await this.getProject(data.projectId); // ensure project exists
    return this.runs.create(data);
  }

  async getRun(id: string): Promise<RunRecord> {
    const run = await this.runs.findById(id);
    if (!run) throw AppError.notFound("Pipeline run");
    return run;
  }

  async listRuns(projectId: string, opts?: { limit?: number; offset?: number }): Promise<RunRecord[]> {
    return this.runs.findByProject(projectId, opts);
  }

  async completeRun(id: string, result: Partial<RunRecord>): Promise<RunRecord> {
    return this.runs.update(id, {
      ...result,
      status: result.qualityGate === "FAILED" ? "COMPLETED" : "COMPLETED",
      completedAt: new Date(),
    });
  }

  async getProjectStats(projectId: string): Promise<ProjectStats> {
    return this.runs.getStats(projectId);
  }
}
