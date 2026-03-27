/**
 * Prisma Repositories Tests (Sprint 15)
 *
 * Testa as implementações Prisma usando mock manual do PrismaClient.
 * O mock é resolvido via moduleNameMapper no jest.config.mjs.
 * A instância compartilhada é acessada via getMockInstance().
 */

import { getMockInstance } from "../__mocks__/@prisma/client.js";
import { createPrismaRepositories } from "../repositories/prisma.js";

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const mockUser = {
  id: "user-1",
  email: "test@nexus.dev",
  name: "Test User",
  passwordHash: "$2a$12$hash",
  role: "MEMBER",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockTeam = {
  id: "team-1",
  name: "Nexus Team",
  slug: "nexus",
  plan: "FREE",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockProject = {
  id: "proj-1",
  teamId: "team-1",
  name: "My Project",
  repoUrl: "https://github.com/test/repo",
  defaultBranch: "main",
  settings: {},
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockRun = {
  id: "run-1",
  projectId: "proj-1",
  triggeredBy: "user-1",
  status: "COMPLETED",
  branch: "main",
  commitSha: "abc123",
  prNumber: null,
  architectureScore: 85,
  securityScore: 90,
  qualityGate: "PASSED",
  findingsCount: 3,
  criticalCount: 0,
  durationMs: 5000,
  modelTier: "haiku",
  tokensUsed: 1500,
  startedAt: new Date("2026-01-01"),
  completedAt: new Date("2026-01-01"),
};

const mockMember = {
  id: "member-1",
  userId: "user-1",
  teamId: "team-1",
  role: "OWNER",
  joinedAt: new Date("2026-01-01"),
};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("PrismaRepositories", () => {
  const prisma = getMockInstance();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create all 7 repositories", async () => {
    const { repos, disconnect } = await createPrismaRepositories("postgresql://test");

    expect(repos.users).toBeDefined();
    expect(repos.projects).toBeDefined();
    expect(repos.runs).toBeDefined();
    expect(repos.teams).toBeDefined();
    expect(repos.members).toBeDefined();
    expect(repos.audit).toBeDefined();
    expect(repos.health).toBeDefined();
    expect(typeof disconnect).toBe("function");
  });

  it("should find user by email", async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const user = await repos.users.findByEmail("test@nexus.dev");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("test@nexus.dev");
    expect(user!.id).toBe("user-1");
  });

  it("should create user with passwordHash", async () => {
    prisma.user.create.mockResolvedValue(mockUser);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const user = await repos.users.create({
      email: "test@nexus.dev",
      name: "Test User",
      passwordHash: "$2a$12$hash",
    });
    expect(user.email).toBe("test@nexus.dev");
    expect(user.role).toBe("MEMBER");
  });

  it("should find projects by team", async () => {
    prisma.project.findMany.mockResolvedValue([mockProject]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const projects = await repos.projects.findByTeam("team-1");
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("My Project");
  });

  it("should create and query pipeline runs", async () => {
    prisma.pipelineRun.create.mockResolvedValue(mockRun);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const run = await repos.runs.create({
      projectId: "proj-1",
      triggeredBy: "user-1",
      branch: "main",
    });
    expect(run.status).toBe("COMPLETED");
    expect(run.architectureScore).toBe(85);
  });

  it("should calculate project stats", async () => {
    prisma.pipelineRun.findMany.mockResolvedValue([
      { ...mockRun, architectureScore: 80, securityScore: 90, qualityGate: "PASSED", findingsCount: 5, durationMs: 3000 },
      { ...mockRun, architectureScore: 90, securityScore: 85, qualityGate: "PASSED", findingsCount: 2, durationMs: 4000 },
    ]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const stats = await repos.runs.getStats("proj-1");
    expect(stats.totalRuns).toBe(2);
    expect(stats.avgArchitectureScore).toBe(85);
    expect(stats.passRate).toBe(1);
    expect(stats.totalFindings).toBe(7);
  });

  it("should find teams by user membership", async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { ...mockMember, team: mockTeam },
    ]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const teams = await repos.teams.findByUser("user-1");
    expect(teams).toHaveLength(1);
    expect(teams[0]!.slug).toBe("nexus");
  });

  it("should find membership by userId + teamId", async () => {
    prisma.teamMember.findUnique.mockResolvedValue(mockMember);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const membership = await repos.members.findMembership("user-1", "team-1");
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe("OWNER");
  });

  it("should record audit entry", async () => {
    prisma.auditLog.create.mockResolvedValue({});
    const { repos } = await createPrismaRepositories("postgresql://test");

    await repos.audit.record({
      userId: "user-1",
      action: "project.create",
      resource: "project",
      resourceId: "proj-1",
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("should check database health", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const healthy = await repos.health.checkDatabase();
    expect(healthy).toBe(true);
  });

  it("should return false on database health failure", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));
    const { repos } = await createPrismaRepositories("postgresql://test");

    const healthy = await repos.health.checkDatabase();
    expect(healthy).toBe(false);
  });

  it("should disconnect gracefully", async () => {
    const { disconnect } = await createPrismaRepositories("postgresql://test");
    await disconnect();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
