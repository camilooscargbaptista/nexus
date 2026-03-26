import { DashboardStats, TrendPoint, PipelineRun, Finding, FindingsByCategory, RunStatus, FindingSeverity, FindingLayer, GateResult } from "../types";

/**
 * Generate mock dashboard statistics with realistic trends
 * @param days Number of days to generate data for
 * @returns Mock DashboardStats
 */
export function generateMockDashboardStats(days: number = 30): DashboardStats {
  const trendsData: TrendPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Generate trends showing improvement over time
    const dayProgression = (days - i) / days;
    const baseArchScore = 70 + dayProgression * 20 + Math.random() * 5;
    const baseSecScore = 75 + dayProgression * 15 + Math.random() * 5;
    const baseFindings = Math.max(5, 20 - dayProgression * 15 + Math.random() * 5);
    const baseRuns = Math.floor(3 + Math.random() * 4);

    trendsData.push({
      date: date.toISOString().split("T")[0],
      archScore: Math.min(100, Math.max(0, baseArchScore)),
      secScore: Math.min(100, Math.max(0, baseSecScore)),
      findings: Math.floor(baseFindings),
      runs: baseRuns,
    });
  }

  const totalRuns = trendsData.reduce((sum, t) => sum + t.runs, 0);
  const passedRuns = Math.floor(totalRuns * 0.85);

  return {
    totalRuns,
    passRate: (passedRuns / totalRuns) * 100,
    avgArchScore: trendsData.reduce((sum, t) => sum + t.archScore, 0) / trendsData.length,
    avgSecScore: trendsData.reduce((sum, t) => sum + t.secScore, 0) / trendsData.length,
    totalFindings: trendsData.reduce((sum, t) => sum + t.findings, 0),
    criticalFindings: Math.floor(trendsData.reduce((sum, t) => sum + t.findings, 0) * 0.15),
    avgDurationMs: 45000 + Math.random() * 15000,
    trendsData,
  };
}

/**
 * Generate mock pipeline runs
 * @param count Number of runs to generate
 * @returns Array of mock PipelineRun objects
 */
export function generateMockRuns(count: number = 10): PipelineRun[] {
  const statuses: RunStatus[] = ["COMPLETED", "RUNNING", "PENDING", "FAILED", "CANCELLED"];
  const gatResults: GateResult[] = ["PASSED", "FAILED", "WARNING"];
  const branches = ["main", "develop", "feature/auth", "feature/dashboard", "hotfix/bug"];
  const runs: PipelineRun[] = [];

  for (let i = 0; i < count; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const durationMs = status === "RUNNING" ? undefined : 30000 + Math.random() * 60000;
    const completedAt = status === "RUNNING" || status === "PENDING" ? undefined : new Date(startedAt.getTime() + (durationMs || 0));
    const findingsCount = Math.floor(Math.random() * 20);

    runs.push({
      id: `run-${i + 1}`,
      projectId: "project-1",
      triggeredBy: `user-${Math.floor(Math.random() * 5) + 1}`,
      status,
      branch: branches[Math.floor(Math.random() * branches.length)],
      commitSha: `${Math.random().toString(16).substring(2, 10)}`,
      prNumber: Math.random() > 0.5 ? Math.floor(Math.random() * 100) : undefined,
      architectureScore: status === "COMPLETED" ? 70 + Math.random() * 30 : undefined,
      securityScore: status === "COMPLETED" ? 75 + Math.random() * 25 : undefined,
      qualityGate: status === "COMPLETED" ? gatResults[Math.floor(Math.random() * gatResults.length)] : undefined,
      findingsCount: findingsCount,
      criticalCount: Math.floor(Math.random() * Math.min(5, findingsCount + 1)),
      durationMs,
      modelTier: ["gpt-4", "gpt-4-turbo", "gpt-3.5"][Math.floor(Math.random() * 3)],
      tokensUsed: status === "COMPLETED" ? Math.floor(100000 + Math.random() * 400000) : undefined,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
    });
  }

  // Sort by startedAt descending
  return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/**
 * Generate mock findings
 * @param count Number of findings to generate
 * @returns Array of mock Finding objects
 */
export function generateMockFindings(count: number = 15): Finding[] {
  const layers: FindingLayer[] = ["perception", "validation", "reasoning", "autonomy"];
  const severities: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];
  const categories = [
    "Security Vulnerability",
    "Code Quality",
    "Performance Issue",
    "Documentation Gap",
    "Test Coverage",
    "API Design",
    "Type Safety",
    "Error Handling",
  ];

  const findings: Finding[] = [];

  for (let i = 0; i < count; i++) {
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const layer = layers[Math.floor(Math.random() * layers.length)];
    const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    findings.push({
      id: `finding-${i + 1}`,
      runId: `run-${Math.floor(Math.random() * 10) + 1}`,
      layer,
      category,
      severity,
      title: `${category}: Issue in ${layer} layer`,
      description: `This is a ${severity} severity finding detected in the ${layer} layer during code analysis.`,
      filePath: Math.random() > 0.3 ? `src/${["api", "utils", "components", "hooks"][Math.floor(Math.random() * 4)]}/file-${Math.floor(Math.random() * 20) + 1}.ts` : undefined,
      line: Math.random() > 0.3 ? Math.floor(Math.random() * 500) + 1 : undefined,
      confidence: 0.7 + Math.random() * 0.3,
      suggestion: "Review the code and apply recommended fixes.",
      metadata: {
        rule: "rule-" + Math.floor(Math.random() * 100),
        tags: ["security", "code-quality"],
      },
      dismissed: Math.random() > 0.7,
      createdAt: createdAt.toISOString(),
    });
  }

  return findings;
}

/**
 * Generate mock findings grouped by category
 * @returns Array of FindingsByCategory
 */
export function generateMockFindingsByCategory(): FindingsByCategory[] {
  const categories = [
    "Security Vulnerability",
    "Code Quality",
    "Performance Issue",
    "Documentation Gap",
    "Test Coverage",
    "API Design",
  ];

  return categories.map((category) => ({
    category,
    critical: Math.floor(Math.random() * 5),
    high: Math.floor(Math.random() * 8),
    medium: Math.floor(Math.random() * 12),
    low: Math.floor(Math.random() * 15),
    info: Math.floor(Math.random() * 20),
  }));
}

/**
 * Generate a mock user object
 */
export function generateMockUser(id: string = "user-1") {
  const names = ["Alice Johnson", "Bob Smith", "Carol Davis", "David Lee", "Emma Wilson"];
  const name = names[Math.floor(Math.random() * names.length)];

  return {
    id,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    name,
    role: "OWNER" as const,
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Generate a mock team object
 */
export function generateMockTeam(id: string = "team-1") {
  return {
    id,
    name: "Engineering Team",
    slug: "engineering-team",
    plan: "PRO" as const,
    createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    memberCount: Math.floor(Math.random() * 15) + 3,
  };
}

/**
 * Generate a mock project object
 */
export function generateMockProject(teamId: string = "team-1", id: string = "project-1") {
  return {
    id,
    teamId,
    name: "Nexus Dashboard",
    repoUrl: "https://github.com/nexus-cloud/dashboard",
    defaultBranch: "main",
    settings: {
      enableAutoChecks: true,
      checkInterval: "daily",
    },
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
