/**
 * ProjectService Tests
 * @author Test Suite
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ProjectService } from "../services/project-service.js";
import { createInMemoryRepositories } from "../repositories/in-memory.js";
import { AppError } from "../middleware/error-handler.js";

describe("ProjectService", () => {
  let projectService: ProjectService;
  let repos: ReturnType<typeof createInMemoryRepositories>;
  const testTeamId = "team-123";

  beforeEach(() => {
    repos = createInMemoryRepositories();
    projectService = new ProjectService(repos.projects, repos.runs);
  });

  describe("createProject", () => {
    it("creates project with defaults", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "My Project",
      });

      expect(project.id).toBeDefined();
      expect(project.teamId).toBe(testTeamId);
      expect(project.name).toBe("My Project");
      expect(project.defaultBranch).toBe("main");
      expect(project.settings).toEqual({});
      expect(project.createdAt).toBeInstanceOf(Date);
    });

    it("creates project with custom repo and branch", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Advanced Project",
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "develop",
      });

      expect(project.repoUrl).toBe("https://github.com/org/repo");
      expect(project.defaultBranch).toBe("develop");
    });
  });

  describe("getProject", () => {
    it("returns project by ID", async () => {
      const created = await projectService.createProject({
        teamId: testTeamId,
        name: "Fetch Test",
      });

      const retrieved = await projectService.getProject(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe("Fetch Test");
    });

    it("throws if not found", async () => {
      await expect(
        projectService.getProject("nonexistent-project-id")
      ).rejects.toThrow(AppError);
    });
  });

  describe("listProjects", () => {
    it("filters by team", async () => {
      const team1 = "team-1";
      const team2 = "team-2";

      await projectService.createProject({
        teamId: team1,
        name: "Project A",
      });
      await projectService.createProject({
        teamId: team1,
        name: "Project B",
      });
      await projectService.createProject({
        teamId: team2,
        name: "Project C",
      });

      const team1Projects = await projectService.listProjects(team1);

      expect(team1Projects).toHaveLength(2);
      expect(team1Projects.map((p) => p.name)).toEqual([
        "Project A",
        "Project B",
      ]);
    });
  });

  describe("updateProject", () => {
    it("updates fields", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Original Name",
      });

      const updated = await projectService.updateProject(project.id, {
        name: "Updated Name",
        defaultBranch: "staging",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.defaultBranch).toBe("staging");
    });

    it("throws if project not found", async () => {
      await expect(
        projectService.updateProject("nonexistent-id", { name: "New Name" })
      ).rejects.toThrow(AppError);
    });
  });

  describe("deleteProject", () => {
    it("removes project", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "To Delete",
      });

      await projectService.deleteProject(project.id);

      await expect(projectService.getProject(project.id)).rejects.toThrow(
        AppError
      );
    });

    it("throws if project not found", async () => {
      await expect(projectService.deleteProject("nonexistent-id")).rejects.toThrow(
        AppError
      );
    });
  });

  describe("createRun", () => {
    it("creates run linked to project", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Run Test Project",
      });

      const run = await projectService.createRun({
        projectId: project.id,
        triggeredBy: "user-123",
        branch: "main",
      });

      expect(run.id).toBeDefined();
      expect(run.projectId).toBe(project.id);
      expect(run.triggeredBy).toBe("user-123");
      expect(run.branch).toBe("main");
      expect(run.status).toBe("PENDING");
      expect(run.startedAt).toBeInstanceOf(Date);
    });

    it("throws if project not found", async () => {
      await expect(
        projectService.createRun({
          projectId: "nonexistent-project",
          triggeredBy: "user-123",
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe("getRun", () => {
    it("returns run by ID", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Get Run Test",
      });

      const created = await projectService.createRun({
        projectId: project.id,
        triggeredBy: "user-456",
      });

      const retrieved = await projectService.getRun(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.triggeredBy).toBe("user-456");
    });

    it("throws if run not found", async () => {
      await expect(projectService.getRun("nonexistent-run")).rejects.toThrow(
        AppError
      );
    });
  });

  describe("listRuns", () => {
    it("returns paginated results", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "List Runs Test",
      });

      for (let i = 0; i < 5; i++) {
        await projectService.createRun({
          projectId: project.id,
          triggeredBy: "user-789",
        });
      }

      const page1 = await projectService.listRuns(project.id, {
        limit: 2,
        offset: 0,
      });

      expect(page1).toHaveLength(2);

      const page2 = await projectService.listRuns(project.id, {
        limit: 2,
        offset: 2,
      });

      expect(page2).toHaveLength(2);
    });

    it("returns all runs when no pagination", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "All Runs Test",
      });

      for (let i = 0; i < 3; i++) {
        await projectService.createRun({
          projectId: project.id,
          triggeredBy: "user-999",
        });
      }

      const allRuns = await projectService.listRuns(project.id);

      expect(allRuns.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("completeRun", () => {
    it("sets status and completedAt", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Complete Run Test",
      });

      const run = await projectService.createRun({
        projectId: project.id,
        triggeredBy: "user-111",
      });

      const completed = await projectService.completeRun(run.id, {
        status: "COMPLETED",
        qualityGate: "PASSED",
        architectureScore: 95,
        securityScore: 88,
        durationMs: 5000,
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.architectureScore).toBe(95);
      expect(completed.securityScore).toBe(88);
    });
  });

  describe("getProjectStats", () => {
    it("calculates averages", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Stats Test",
      });

      const run1 = await projectService.createRun({
        projectId: project.id,
        triggeredBy: "user-222",
      });

      const run2 = await projectService.createRun({
        projectId: project.id,
        triggeredBy: "user-222",
      });

      await projectService.completeRun(run1.id, {
        status: "COMPLETED",
        qualityGate: "PASSED",
        architectureScore: 90,
        securityScore: 85,
        durationMs: 3000,
        findingsCount: 2,
      });

      await projectService.completeRun(run2.id, {
        status: "COMPLETED",
        qualityGate: "PASSED",
        architectureScore: 80,
        securityScore: 75,
        durationMs: 4000,
        findingsCount: 5,
      });

      const stats = await projectService.getProjectStats(project.id);

      expect(stats.totalRuns).toBe(2);
      expect(stats.avgArchitectureScore).toBe(85);
      expect(stats.avgSecurityScore).toBe(80);
      expect(stats.passRate).toBe(1);
      expect(stats.totalFindings).toBe(7);
      expect(stats.avgDurationMs).toBe(3500);
    });

    it("returns zeros for empty project", async () => {
      const project = await projectService.createProject({
        teamId: testTeamId,
        name: "Empty Stats Test",
      });

      const stats = await projectService.getProjectStats(project.id);

      expect(stats.totalRuns).toBe(0);
      expect(stats.avgArchitectureScore).toBe(0);
      expect(stats.avgSecurityScore).toBe(0);
      expect(stats.passRate).toBe(0);
      expect(stats.totalFindings).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
    });
  });
});
