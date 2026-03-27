/**
 * Prisma Repositories Tests (Sprint 15)
 *
 * Testa as implementações Prisma usando mock do PrismaClient.
 * Valida que cada repo implementa a interface corretamente.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ═══════════════════════════════════════════════════════════════
// MOCK DO PRISMA CLIENT
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

// PrismaClient mock — use jest.fn<any>() to avoid TS strict mock typing issues
const mockPrisma = {
  user: {
    findUnique: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  team: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  teamMember: {
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
  },
  project: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
  },
  pipelineRun: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  auditLog: {
    create: jest.fn<any>(),
  },
  $queryRaw: jest.fn<any>(),
  $connect: jest.fn<any>(),
  $disconnect: jest.fn<any>(),
};

// Mock the PrismaClient constructor
jest.unstable_mockModule("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("PrismaRepositories", () => {
  let createPrismaRepositories: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import("../repositories/prisma.js");
    createPrismaRepositories = mod.createPrismaRepositories;
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
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const user = await repos.users.findByEmail("test@nexus.dev");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("test@nexus.dev");
    expect(user!.id).toBe("user-1");
  });

  it("should create user with passwordHash", async () => {
    (mockPrisma.user.create as jest.Mock).mockResolvedValue(mockUser);
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
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([mockProject]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const projects = await repos.projects.findByTeam("team-1");
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("My Project");
  });

  it("should create and query pipeline runs", async () => {
    (mockPrisma.pipelineRun.create as jest.Mock).mockResolvedValue(mockRun);
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
    (mockPrisma.pipelineRun.findMany as jest.Mock).mockResolvedValue([
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
    (mockPrisma.teamMember.findMany as jest.Mock).mockResolvedValue([
      { ...mockMember, team: mockTeam },
    ]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const teams = await repos.teams.findByUser("user-1");
    expect(teams).toHaveLength(1);
    expect(teams[0]!.slug).toBe("nexus");
  });

  it("should find membership by userId + teamId", async () => {
    (mockPrisma.teamMember.findUnique as jest.Mock).mockResolvedValue(mockMember);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const membership = await repos.members.findMembership("user-1", "team-1");
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe("OWNER");
  });

  it("should record audit entry", async () => {
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
    const { repos } = await createPrismaRepositories("postgresql://test");

    await repos.audit.record({
      userId: "user-1",
      action: "project.create",
      resource: "project",
      resourceId: "proj-1",
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("should check database health", async () => {
    (mockPrisma.$queryRaw as jest.Mock<any>).mockResolvedValue([{ "?column?": 1 }]);
    const { repos } = await createPrismaRepositories("postgresql://test");

    const healthy = await repos.health.checkDatabase();
    expect(healthy).toBe(true);
  });

  it("should return false on database health failure", async () => {
    (mockPrisma.$queryRaw as jest.Mock<any>).mockRejectedValue(new Error("Connection refused"));
    const { repos } = await createPrismaRepositories("postgresql://test");

    const healthy = await repos.health.checkDatabase();
    expect(healthy).toBe(false);
  });

  it("should disconnect gracefully", async () => {
    const { disconnect } = await createPrismaRepositories("postgresql://test");
    await disconnect();
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
