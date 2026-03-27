/**
 * In-memory repository implementations
 *
 * Used for development, testing, and demos.
 * Swap with Prisma implementations for production.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { UserRepository, UserRecord, CreateUserData } from "../services/auth-service.js";
import { ProjectRepository, ProjectRecord, CreateProjectData, RunRepository, RunRecord, CreateRunData, ProjectStats } from "../services/project-service.js";
import { TeamRepository, TeamRecord, CreateTeamData, MemberRepository, MemberRecord } from "../services/team-service.js";
import { AuditStore, AuditEntry } from "../middleware/audit.js";
import { HealthCheck } from "../routes/health-routes.js";
import { Repositories } from "../app.js";
import { InMemoryFindingRepository } from "../routes/pipeline-routes.js";

function uuid(): string {
  return crypto.randomUUID();
}

class InMemoryUserRepository implements UserRepository {
  private users: Map<string, UserRecord> = new Map();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) || null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) || null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const user: UserRecord = { id: uuid(), ...data, role: "MEMBER", createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }
}

class InMemoryProjectRepository implements ProjectRepository {
  private projects: Map<string, ProjectRecord> = new Map();

  async findById(id: string): Promise<ProjectRecord | null> {
    return this.projects.get(id) || null;
  }

  async findByTeam(teamId: string): Promise<ProjectRecord[]> {
    return [...this.projects.values()].filter((p) => p.teamId === teamId);
  }

  async create(data: CreateProjectData): Promise<ProjectRecord> {
    const project: ProjectRecord = {
      id: uuid(),
      teamId: data.teamId,
      name: data.name,
      repoUrl: data.repoUrl,
      defaultBranch: data.defaultBranch || "main",
      settings: {},
      createdAt: new Date(),
    };
    this.projects.set(project.id, project);
    return project;
  }

  async update(id: string, data: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const project = this.projects.get(id);
    if (!project) throw new Error("Project not found");
    const updated = { ...project, ...data };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id);
  }
}

class InMemoryRunRepository implements RunRepository {
  private runs: Map<string, RunRecord> = new Map();

  async findById(id: string): Promise<RunRecord | null> {
    return this.runs.get(id) || null;
  }

  async findByProject(projectId: string, opts?: { limit?: number; offset?: number }): Promise<RunRecord[]> {
    const all = [...this.runs.values()]
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 20;
    return all.slice(offset, offset + limit);
  }

  async create(data: CreateRunData): Promise<RunRecord> {
    const run: RunRecord = {
      id: uuid(),
      ...data,
      status: "PENDING",
      findingsCount: 0,
      criticalCount: 0,
      startedAt: new Date(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async update(id: string, data: Partial<RunRecord>): Promise<RunRecord> {
    const run = this.runs.get(id);
    if (!run) throw new Error("Run not found");
    const updated = { ...run, ...data };
    this.runs.set(id, updated);
    return updated;
  }

  async getStats(projectId: string): Promise<ProjectStats> {
    const runs = [...this.runs.values()].filter((r) => r.projectId === projectId && r.status === "COMPLETED");
    if (runs.length === 0) {
      return { totalRuns: 0, avgArchitectureScore: 0, avgSecurityScore: 0, passRate: 0, totalFindings: 0, avgDurationMs: 0 };
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      totalRuns: runs.length,
      avgArchitectureScore: avg(runs.map((r) => r.architectureScore || 0)),
      avgSecurityScore: avg(runs.map((r) => r.securityScore || 0)),
      passRate: runs.filter((r) => r.qualityGate === "PASSED").length / runs.length,
      totalFindings: runs.reduce((sum, r) => sum + r.findingsCount, 0),
      avgDurationMs: avg(runs.map((r) => r.durationMs || 0)),
    };
  }
}

class InMemoryTeamRepository implements TeamRepository {
  private teams: Map<string, TeamRecord> = new Map();

  async findById(id: string): Promise<TeamRecord | null> {
    return this.teams.get(id) || null;
  }

  async findBySlug(slug: string): Promise<TeamRecord | null> {
    return [...this.teams.values()].find((t) => t.slug === slug) || null;
  }

  async findByUser(userId: string): Promise<TeamRecord[]> {
    // This needs member data — simplified for in-memory
    return [...this.teams.values()];
  }

  async create(data: CreateTeamData): Promise<TeamRecord> {
    const team: TeamRecord = { id: uuid(), name: data.name, slug: data.slug, plan: "FREE", createdAt: new Date() };
    this.teams.set(team.id, team);
    return team;
  }

  async update(id: string, data: Partial<TeamRecord>): Promise<TeamRecord> {
    const team = this.teams.get(id);
    if (!team) throw new Error("Team not found");
    const updated = { ...team, ...data };
    this.teams.set(id, updated);
    return updated;
  }
}

class InMemoryMemberRepository implements MemberRepository {
  private members: Map<string, MemberRecord> = new Map();

  async findByTeam(teamId: string): Promise<MemberRecord[]> {
    return [...this.members.values()].filter((m) => m.teamId === teamId);
  }

  async findMembership(userId: string, teamId: string): Promise<MemberRecord | null> {
    return [...this.members.values()].find((m) => m.userId === userId && m.teamId === teamId) || null;
  }

  async add(teamId: string, userId: string, role: string): Promise<MemberRecord> {
    const member: MemberRecord = { id: uuid(), userId, teamId, role, joinedAt: new Date() };
    this.members.set(member.id, member);
    return member;
  }

  async updateRole(id: string, role: string): Promise<MemberRecord> {
    const member = this.members.get(id);
    if (!member) throw new Error("Member not found");
    const updated = { ...member, role };
    this.members.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.members.delete(id);
  }
}

class InMemoryAuditStore implements AuditStore {
  public logs: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.logs.push(entry);
  }
}

class InMemoryHealthCheck implements HealthCheck {
  async checkDatabase(): Promise<boolean> {
    return true;
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    users: new InMemoryUserRepository(),
    projects: new InMemoryProjectRepository(),
    runs: new InMemoryRunRepository(),
    teams: new InMemoryTeamRepository(),
    members: new InMemoryMemberRepository(),
    audit: new InMemoryAuditStore(),
    health: new InMemoryHealthCheck(),
    findings: new InMemoryFindingRepository(),
  };
}
