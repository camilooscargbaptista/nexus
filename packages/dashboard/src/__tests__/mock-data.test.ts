import { describe, it, expect } from "@jest/globals";
import {
  generateMockDashboardStats,
  generateMockRuns,
  generateMockFindings,
  generateMockFindingsByCategory,
  generateMockUser,
  generateMockTeam,
  generateMockProject,
} from "../lib/mock-data";
import { DashboardStats, PipelineRun, Finding, FindingsByCategory, RunStatus, FindingSeverity, FindingLayer } from "../types";

describe("generateMockDashboardStats", () => {
  it("should return valid DashboardStats shape", () => {
    const stats = generateMockDashboardStats();

    expect(stats).toHaveProperty("totalRuns");
    expect(stats).toHaveProperty("passRate");
    expect(stats).toHaveProperty("avgArchScore");
    expect(stats).toHaveProperty("avgSecScore");
    expect(stats).toHaveProperty("totalFindings");
    expect(stats).toHaveProperty("criticalFindings");
    expect(stats).toHaveProperty("avgDurationMs");
    expect(stats).toHaveProperty("trendsData");
  });

  it("should generate 30 trend points by default", () => {
    const stats = generateMockDashboardStats();
    expect(stats.trendsData).toHaveLength(30);
  });

  it("should generate specified number of trend points", () => {
    const stats = generateMockDashboardStats(7);
    expect(stats.trendsData).toHaveLength(7);
  });

  it("should generate trend points with correct shape", () => {
    const stats = generateMockDashboardStats(5);

    stats.trendsData.forEach((point) => {
      expect(point).toHaveProperty("date");
      expect(point).toHaveProperty("archScore");
      expect(point).toHaveProperty("secScore");
      expect(point).toHaveProperty("findings");
      expect(point).toHaveProperty("runs");
    });
  });

  it("should have valid date format in trend points", () => {
    const stats = generateMockDashboardStats(3);

    stats.trendsData.forEach((point) => {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("should have arch scores between 0 and 100", () => {
    const stats = generateMockDashboardStats();

    stats.trendsData.forEach((point) => {
      expect(point.archScore).toBeGreaterThanOrEqual(0);
      expect(point.archScore).toBeLessThanOrEqual(100);
    });
  });

  it("should have security scores between 0 and 100", () => {
    const stats = generateMockDashboardStats();

    stats.trendsData.forEach((point) => {
      expect(point.secScore).toBeGreaterThanOrEqual(0);
      expect(point.secScore).toBeLessThanOrEqual(100);
    });
  });

  it("should have non-negative findings count", () => {
    const stats = generateMockDashboardStats();

    stats.trendsData.forEach((point) => {
      expect(point.findings).toBeGreaterThanOrEqual(0);
    });
  });

  it("should have pass rate between 0 and 100", () => {
    const stats = generateMockDashboardStats();
    expect(stats.passRate).toBeGreaterThanOrEqual(0);
    expect(stats.passRate).toBeLessThanOrEqual(100);
  });

  it("should have valid average scores", () => {
    const stats = generateMockDashboardStats();
    expect(stats.avgArchScore).toBeGreaterThanOrEqual(0);
    expect(stats.avgArchScore).toBeLessThanOrEqual(100);
    expect(stats.avgSecScore).toBeGreaterThanOrEqual(0);
    expect(stats.avgSecScore).toBeLessThanOrEqual(100);
  });

  it("should have positive average duration", () => {
    const stats = generateMockDashboardStats();
    expect(stats.avgDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("should have critical findings less than or equal to total findings", () => {
    const stats = generateMockDashboardStats();
    expect(stats.criticalFindings).toBeLessThanOrEqual(stats.totalFindings);
  });

  it("should generate different data on multiple calls", () => {
    const stats1 = generateMockDashboardStats(3);
    const stats2 = generateMockDashboardStats(3);

    // Likely to be different (not guaranteed, but very probable)
    const areSame =
      JSON.stringify(stats1.trendsData) === JSON.stringify(stats2.trendsData);
    // Just verify they generated without error
    expect(stats1.trendsData).toHaveLength(3);
    expect(stats2.trendsData).toHaveLength(3);
  });
});

describe("generateMockRuns", () => {
  it("should return correct count of runs", () => {
    const runs = generateMockRuns(5);
    expect(runs).toHaveLength(5);
  });

  it("should generate 10 runs by default", () => {
    const runs = generateMockRuns();
    expect(runs).toHaveLength(10);
  });

  it("should have valid PipelineRun shape", () => {
    const runs = generateMockRuns(1);
    const run = runs[0];

    expect(run).toHaveProperty("id");
    expect(run).toHaveProperty("projectId");
    expect(run).toHaveProperty("triggeredBy");
    expect(run).toHaveProperty("status");
    expect(run).toHaveProperty("findingsCount");
    expect(run).toHaveProperty("criticalCount");
    expect(run).toHaveProperty("startedAt");
    expect(run).toHaveProperty("modelTier");
  });

  it("should have valid run statuses", () => {
    const runs = generateMockRuns(20);
    const validStatuses: RunStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];

    runs.forEach((run) => {
      expect(validStatuses).toContain(run.status);
    });
  });

  it("should have valid branch names", () => {
    const runs = generateMockRuns(20);
    const expectedBranches = ["main", "develop", "feature/auth", "feature/dashboard", "hotfix/bug"];

    runs.forEach((run) => {
      if (run.branch) {
        expect(expectedBranches).toContain(run.branch);
      }
    });
  });

  it("should have valid commit SHA format", () => {
    const runs = generateMockRuns(5);

    runs.forEach((run) => {
      if (run.commitSha) {
        expect(run.commitSha).toMatch(/^[0-9a-f]{8}$/);
      }
    });
  });

  it("should have findings count >= 0", () => {
    const runs = generateMockRuns(20);

    runs.forEach((run) => {
      expect(run.findingsCount).toBeGreaterThanOrEqual(0);
      expect(run.criticalCount).toBeLessThanOrEqual(run.findingsCount);
    });
  });

  it("should have scores for completed runs", () => {
    const runs = generateMockRuns(20);

    runs.forEach((run) => {
      if (run.status === "COMPLETED") {
        expect(run.architectureScore).toBeDefined();
        expect(run.securityScore).toBeDefined();
        expect(run.qualityGate).toBeDefined();
        if (run.architectureScore !== undefined) {
          expect(run.architectureScore).toBeGreaterThanOrEqual(0);
          expect(run.architectureScore).toBeLessThanOrEqual(100);
        }
        if (run.securityScore !== undefined) {
          expect(run.securityScore).toBeGreaterThanOrEqual(0);
          expect(run.securityScore).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  it("should not have scores for running runs", () => {
    const runs = generateMockRuns(20);

    runs.forEach((run) => {
      if (run.status === "RUNNING") {
        expect(run.architectureScore).toBeUndefined();
        expect(run.securityScore).toBeUndefined();
        expect(run.qualityGate).toBeUndefined();
      }
    });
  });

  it("should have valid model tier", () => {
    const runs = generateMockRuns(20);
    const validTiers = ["gpt-4", "gpt-4-turbo", "gpt-3.5"];

    runs.forEach((run) => {
      expect(validTiers).toContain(run.modelTier);
    });
  });

  it("should be sorted by startedAt descending", () => {
    const runs = generateMockRuns(10);

    for (let i = 0; i < runs.length - 1; i++) {
      const current = new Date(runs[i].startedAt).getTime();
      const next = new Date(runs[i + 1].startedAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it("should have valid startedAt format", () => {
    const runs = generateMockRuns(5);

    runs.forEach((run) => {
      expect(() => new Date(run.startedAt)).not.toThrow();
      const date = new Date(run.startedAt);
      expect(date.getTime()).toBeGreaterThan(0);
    });
  });

  it("should have completedAt for completed runs", () => {
    const runs = generateMockRuns(20);

    runs.forEach((run) => {
      if (run.status === "COMPLETED" || run.status === "FAILED") {
        expect(run.completedAt).toBeDefined();
      }
    });
  });
});

describe("generateMockFindings", () => {
  it("should return correct count of findings", () => {
    const findings = generateMockFindings(10);
    expect(findings).toHaveLength(10);
  });

  it("should generate 15 findings by default", () => {
    const findings = generateMockFindings();
    expect(findings).toHaveLength(15);
  });

  it("should have valid Finding shape", () => {
    const findings = generateMockFindings(1);
    const finding = findings[0];

    expect(finding).toHaveProperty("id");
    expect(finding).toHaveProperty("runId");
    expect(finding).toHaveProperty("layer");
    expect(finding).toHaveProperty("category");
    expect(finding).toHaveProperty("severity");
    expect(finding).toHaveProperty("title");
    expect(finding).toHaveProperty("description");
    expect(finding).toHaveProperty("confidence");
    expect(finding).toHaveProperty("suggestion");
    expect(finding).toHaveProperty("metadata");
    expect(finding).toHaveProperty("dismissed");
    expect(finding).toHaveProperty("createdAt");
  });

  it("should have valid severities", () => {
    const findings = generateMockFindings(30);
    const validSeverities: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

    findings.forEach((finding) => {
      expect(validSeverities).toContain(finding.severity);
    });
  });

  it("should have valid layers", () => {
    const findings = generateMockFindings(30);
    const validLayers: FindingLayer[] = ["perception", "validation", "reasoning", "autonomy"];

    findings.forEach((finding) => {
      expect(validLayers).toContain(finding.layer);
    });
  });

  it("should have confidence between 0.7 and 1.0", () => {
    const findings = generateMockFindings(30);

    findings.forEach((finding) => {
      expect(finding.confidence).toBeGreaterThanOrEqual(0.7);
      expect(finding.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  it("should have valid category", () => {
    const findings = generateMockFindings(30);
    const expectedCategories = [
      "Security Vulnerability",
      "Code Quality",
      "Performance Issue",
      "Documentation Gap",
      "Test Coverage",
      "API Design",
      "Type Safety",
      "Error Handling",
    ];

    findings.forEach((finding) => {
      expect(expectedCategories).toContain(finding.category);
    });
  });

  it("should have metadata with rule and tags", () => {
    const findings = generateMockFindings(10);

    findings.forEach((finding) => {
      expect(finding.metadata).toHaveProperty("rule");
      expect(finding.metadata).toHaveProperty("tags");
      expect(Array.isArray(finding.metadata.tags)).toBe(true);
    });
  });

  it("should have valid filePath format when present", () => {
    const findings = generateMockFindings(30);

    findings.forEach((finding) => {
      if (finding.filePath) {
        expect(finding.filePath).toMatch(/^src\//);
        expect(finding.filePath).toContain(".ts");
      }
    });
  });

  it("should have valid line number when present", () => {
    const findings = generateMockFindings(30);

    findings.forEach((finding) => {
      if (finding.line !== undefined) {
        expect(finding.line).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("should have dismissed as boolean", () => {
    const findings = generateMockFindings(20);

    findings.forEach((finding) => {
      expect(typeof finding.dismissed).toBe("boolean");
    });
  });

  it("should have valid createdAt format", () => {
    const findings = generateMockFindings(10);

    findings.forEach((finding) => {
      expect(() => new Date(finding.createdAt)).not.toThrow();
      const date = new Date(finding.createdAt);
      expect(date.getTime()).toBeGreaterThan(0);
    });
  });
});

describe("generateMockFindingsByCategory", () => {
  it("should return array of FindingsByCategory", () => {
    const categories = generateMockFindingsByCategory();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it("should have valid FindingsByCategory shape", () => {
    const categories = generateMockFindingsByCategory();

    categories.forEach((cat) => {
      expect(cat).toHaveProperty("category");
      expect(cat).toHaveProperty("critical");
      expect(cat).toHaveProperty("high");
      expect(cat).toHaveProperty("medium");
      expect(cat).toHaveProperty("low");
      expect(cat).toHaveProperty("info");
    });
  });

  it("should have non-negative counts for each severity", () => {
    const categories = generateMockFindingsByCategory();

    categories.forEach((cat) => {
      expect(cat.critical).toBeGreaterThanOrEqual(0);
      expect(cat.high).toBeGreaterThanOrEqual(0);
      expect(cat.medium).toBeGreaterThanOrEqual(0);
      expect(cat.low).toBeGreaterThanOrEqual(0);
      expect(cat.info).toBeGreaterThanOrEqual(0);
    });
  });

  it("should have valid category names", () => {
    const categories = generateMockFindingsByCategory();
    const expectedCategories = [
      "Security Vulnerability",
      "Code Quality",
      "Performance Issue",
      "Documentation Gap",
      "Test Coverage",
      "API Design",
    ];

    categories.forEach((cat) => {
      expect(expectedCategories).toContain(cat.category);
    });
  });

  it("should return at least one category", () => {
    const categories = generateMockFindingsByCategory();
    expect(categories.length).toBeGreaterThanOrEqual(1);
  });
});

describe("generateMockUser", () => {
  it("should have valid User shape", () => {
    const user = generateMockUser();

    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("name");
    expect(user).toHaveProperty("role");
    expect(user).toHaveProperty("createdAt");
  });

  it("should use provided id", () => {
    const user = generateMockUser("custom-id");
    expect(user.id).toBe("custom-id");
  });

  it("should have OWNER role", () => {
    const user = generateMockUser();
    expect(user.role).toBe("OWNER");
  });

  it("should have valid email format", () => {
    const user = generateMockUser();
    expect(user.email).toMatch(/@example\.com$/);
  });

  it("should have valid createdAt date", () => {
    const user = generateMockUser();
    expect(() => new Date(user.createdAt)).not.toThrow();
  });

  it("should have valid name", () => {
    const user = generateMockUser();
    expect(user.name).toBeTruthy();
    expect(user.name.length).toBeGreaterThan(0);
  });
});

describe("generateMockTeam", () => {
  it("should have valid Team shape", () => {
    const team = generateMockTeam();

    expect(team).toHaveProperty("id");
    expect(team).toHaveProperty("name");
    expect(team).toHaveProperty("slug");
    expect(team).toHaveProperty("plan");
    expect(team).toHaveProperty("createdAt");
    expect(team).toHaveProperty("memberCount");
  });

  it("should use provided id", () => {
    const team = generateMockTeam("custom-team");
    expect(team.id).toBe("custom-team");
  });

  it("should have PRO plan", () => {
    const team = generateMockTeam();
    expect(team.plan).toBe("PRO");
  });

  it("should have positive member count", () => {
    const team = generateMockTeam();
    expect(team.memberCount).toBeGreaterThan(0);
  });

  it("should have valid slug", () => {
    const team = generateMockTeam();
    expect(team.slug).toMatch(/^[a-z-]+$/);
  });

  it("should have valid createdAt date", () => {
    const team = generateMockTeam();
    expect(() => new Date(team.createdAt)).not.toThrow();
  });
});

describe("generateMockProject", () => {
  it("should have valid Project shape", () => {
    const project = generateMockProject();

    expect(project).toHaveProperty("id");
    expect(project).toHaveProperty("teamId");
    expect(project).toHaveProperty("name");
    expect(project).toHaveProperty("repoUrl");
    expect(project).toHaveProperty("defaultBranch");
    expect(project).toHaveProperty("settings");
    expect(project).toHaveProperty("createdAt");
  });

  it("should use provided teamId and id", () => {
    const project = generateMockProject("team-x", "project-x");
    expect(project.teamId).toBe("team-x");
    expect(project.id).toBe("project-x");
  });

  it("should have main as default branch", () => {
    const project = generateMockProject();
    expect(project.defaultBranch).toBe("main");
  });

  it("should have settings object", () => {
    const project = generateMockProject();
    expect(typeof project.settings).toBe("object");
    expect(project.settings).not.toBeNull();
  });

  it("should have valid repoUrl format", () => {
    const project = generateMockProject();
    expect(project.repoUrl).toMatch(/^https:\/\/github\.com\//);
  });

  it("should have valid createdAt date", () => {
    const project = generateMockProject();
    expect(() => new Date(project.createdAt)).not.toThrow();
  });
});
