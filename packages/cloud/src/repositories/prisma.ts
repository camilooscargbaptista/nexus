/**
 * Prisma repository implementations
 *
 * Production-ready persistence layer using Prisma Client.
 * Implements all 7 repository interfaces from the services layer.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { PrismaClient } from "@prisma/client";
import { UserRepository, UserRecord, CreateUserData } from "../services/auth-service.js";
import { ProjectRepository, ProjectRecord, CreateProjectData, RunRepository, RunRecord, CreateRunData, ProjectStats } from "../services/project-service.js";
import { TeamRepository, TeamRecord, CreateTeamData, MemberRepository, MemberRecord } from "../services/team-service.js";
import { AuditStore, AuditEntry } from "../middleware/audit.js";
import { HealthCheck } from "../routes/health-routes.js";
import { Repositories } from "../app.js";

// ═══════════════════════════════════════════════════════════════
// USER REPOSITORY
// ═══════════════════════════════════════════════════════════════

class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toRecord(user) : null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
      },
    });
    return this.toRecord(user);
  }

  async update(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.email && { email: data.email }),
        ...(data.name && { name: data.name }),
        ...(data.role && { role: data.role as any }),
      },
    });
    return this.toRecord(user);
  }

  private toRecord(user: any): UserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PROJECT REPOSITORY
// ═══════════════════════════════════════════════════════════════

class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ProjectRecord | null> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    return project ? this.toRecord(project) : null;
  }

  async findByTeam(teamId: string): Promise<ProjectRecord[]> {
    const projects = await this.prisma.project.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    });
    return projects.map(this.toRecord);
  }

  async create(data: CreateProjectData): Promise<ProjectRecord> {
    const project = await this.prisma.project.create({
      data: {
        teamId: data.teamId,
        name: data.name,
        repoUrl: data.repoUrl,
        defaultBranch: data.defaultBranch ?? "main",
      },
    });
    return this.toRecord(project);
  }

  async update(id: string, data: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.repoUrl !== undefined && { repoUrl: data.repoUrl }),
        ...(data.defaultBranch && { defaultBranch: data.defaultBranch }),
        ...(data.settings && { settings: data.settings as any }),
      },
    });
    return this.toRecord(project);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }

  private toRecord(project: any): ProjectRecord {
    return {
      id: project.id,
      teamId: project.teamId,
      name: project.name,
      repoUrl: project.repoUrl ?? undefined,
      defaultBranch: project.defaultBranch,
      settings: typeof project.settings === "object" ? project.settings : {},
      createdAt: project.createdAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN REPOSITORY
// ═══════════════════════════════════════════════════════════════

class PrismaRunRepository implements RunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<RunRecord | null> {
    const run = await this.prisma.pipelineRun.findUnique({ where: { id } });
    return run ? this.toRecord(run) : null;
  }

  async findByProject(projectId: string, opts?: { limit?: number; offset?: number }): Promise<RunRecord[]> {
    const runs = await this.prisma.pipelineRun.findMany({
      where: { projectId },
      orderBy: { startedAt: "desc" },
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
    return runs.map(this.toRecord);
  }

  async create(data: CreateRunData): Promise<RunRecord> {
    const run = await this.prisma.pipelineRun.create({
      data: {
        projectId: data.projectId,
        triggeredBy: data.triggeredBy,
        branch: data.branch,
        commitSha: data.commitSha,
        prNumber: data.prNumber,
      },
    });
    return this.toRecord(run);
  }

  async update(id: string, data: Partial<RunRecord>): Promise<RunRecord> {
    const run = await this.prisma.pipelineRun.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status as any }),
        ...(data.architectureScore !== undefined && { architectureScore: data.architectureScore }),
        ...(data.securityScore !== undefined && { securityScore: data.securityScore }),
        ...(data.qualityGate && { qualityGate: data.qualityGate as any }),
        ...(data.findingsCount !== undefined && { findingsCount: data.findingsCount }),
        ...(data.criticalCount !== undefined && { criticalCount: data.criticalCount }),
        ...(data.durationMs !== undefined && { durationMs: data.durationMs }),
        ...(data.modelTier && { modelTier: data.modelTier }),
        ...(data.tokensUsed !== undefined && { tokensUsed: data.tokensUsed }),
        ...(data.completedAt && { completedAt: data.completedAt }),
      },
    });
    return this.toRecord(run);
  }

  async getStats(projectId: string): Promise<ProjectStats> {
    const runs = await this.prisma.pipelineRun.findMany({
      where: { projectId, status: "COMPLETED" },
      select: {
        architectureScore: true,
        securityScore: true,
        qualityGate: true,
        findingsCount: true,
        durationMs: true,
      },
    });

    if (runs.length === 0) {
      return { totalRuns: 0, avgArchitectureScore: 0, avgSecurityScore: 0, passRate: 0, totalFindings: 0, avgDurationMs: 0 };
    }

    const avg = (arr: number[]): number => arr.reduce((a: number, b: number) => a + b, 0) / arr.length;

    return {
      totalRuns: runs.length,
      avgArchitectureScore: avg(runs.map((r: any) => r.architectureScore ?? 0)),
      avgSecurityScore: avg(runs.map((r: any) => r.securityScore ?? 0)),
      passRate: runs.filter((r: any) => r.qualityGate === "PASSED").length / runs.length,
      totalFindings: runs.reduce((sum: number, r: any) => sum + r.findingsCount, 0),
      avgDurationMs: avg(runs.map((r: any) => r.durationMs ?? 0)),
    };
  }

  private toRecord(run: any): RunRecord {
    return {
      id: run.id,
      projectId: run.projectId,
      triggeredBy: run.triggeredBy,
      status: run.status,
      branch: run.branch ?? undefined,
      commitSha: run.commitSha ?? undefined,
      prNumber: run.prNumber ?? undefined,
      architectureScore: run.architectureScore ?? undefined,
      securityScore: run.securityScore ?? undefined,
      qualityGate: run.qualityGate ?? undefined,
      findingsCount: run.findingsCount,
      criticalCount: run.criticalCount,
      durationMs: run.durationMs ?? undefined,
      modelTier: run.modelTier ?? undefined,
      tokensUsed: run.tokensUsed ?? undefined,
      startedAt: run.startedAt,
      completedAt: run.completedAt ?? undefined,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TEAM REPOSITORY
// ═══════════════════════════════════════════════════════════════

class PrismaTeamRepository implements TeamRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TeamRecord | null> {
    const team = await this.prisma.team.findUnique({ where: { id } });
    return team ? this.toRecord(team) : null;
  }

  async findBySlug(slug: string): Promise<TeamRecord | null> {
    const team = await this.prisma.team.findUnique({ where: { slug } });
    return team ? this.toRecord(team) : null;
  }

  async findByUser(userId: string): Promise<TeamRecord[]> {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      include: { team: true },
    });
    return memberships.map((m: any) => this.toRecord(m.team));
  }

  async create(data: CreateTeamData): Promise<TeamRecord> {
    const team = await this.prisma.team.create({
      data: { name: data.name, slug: data.slug },
    });
    return this.toRecord(team);
  }

  async update(id: string, data: Partial<TeamRecord>): Promise<TeamRecord> {
    const team = await this.prisma.team.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.plan && { plan: data.plan as any }),
      },
    });
    return this.toRecord(team);
  }

  private toRecord(team: any): TeamRecord {
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      plan: team.plan,
      createdAt: team.createdAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// MEMBER REPOSITORY
// ═══════════════════════════════════════════════════════════════

class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTeam(teamId: string): Promise<MemberRecord[]> {
    const members = await this.prisma.teamMember.findMany({ where: { teamId } });
    return members.map(this.toRecord);
  }

  async findMembership(userId: string, teamId: string): Promise<MemberRecord | null> {
    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    return member ? this.toRecord(member) : null;
  }

  async add(teamId: string, userId: string, role: string): Promise<MemberRecord> {
    const member = await this.prisma.teamMember.create({
      data: { teamId, userId, role: role as any },
    });
    return this.toRecord(member);
  }

  async updateRole(id: string, role: string): Promise<MemberRecord> {
    const member = await this.prisma.teamMember.update({
      where: { id },
      data: { role: role as any },
    });
    return this.toRecord(member);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.teamMember.delete({ where: { id } });
  }

  private toRecord(member: any): MemberRecord {
    return {
      id: member.id,
      userId: member.userId,
      teamId: member.teamId,
      role: member.role,
      joinedAt: member.joinedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIT STORE
// ═══════════════════════════════════════════════════════════════

class PrismaAuditStore implements AuditStore {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        teamId: entry.teamId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        metadata: entry.metadata ?? {},
        ip: entry.ip,
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

class PrismaHealthCheck implements HealthCheck {
  constructor(private readonly prisma: PrismaClient) {}

  async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Cria todas as repositories Prisma + PrismaClient.
 *
 * @param databaseUrl - PostgreSQL connection string
 * @returns Repositories + disconnect function
 */
export async function createPrismaRepositories(databaseUrl: string): Promise<{
  repos: Repositories;
  disconnect: () => Promise<void>;
}> {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });

  // Verify connection
  await prisma.$connect();

  return {
    repos: {
      users: new PrismaUserRepository(prisma),
      projects: new PrismaProjectRepository(prisma),
      runs: new PrismaRunRepository(prisma),
      teams: new PrismaTeamRepository(prisma),
      members: new PrismaMemberRepository(prisma),
      audit: new PrismaAuditStore(prisma),
      health: new PrismaHealthCheck(prisma),
    },
    disconnect: () => prisma.$disconnect(),
  };
}
