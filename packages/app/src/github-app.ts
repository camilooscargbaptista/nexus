/**
 * Nexus GitHub App — Architecture review on pull requests
 *
 * Webhook-driven: listens for pull_request events, clones the repo,
 * runs the Nexus pipeline, and posts a structured comment with findings.
 *
 * Designed for Probot but adapter-agnostic — the core logic is in
 * NexusReviewHandler which accepts generic webhook payloads.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PRWebhookPayload {
  action: "opened" | "synchronize" | "reopened";
  pullRequest: {
    number: number;
    title: string;
    author: string;
    headSha: string;
    baseBranch: string;
    headBranch: string;
    url: string;
  };
  repository: {
    owner: string;
    name: string;
    fullName: string;
    cloneUrl: string;
    defaultBranch: string;
  };
}

export interface ReviewComment {
  body: string;
  score: number;
  findingsCount: number;
  criticalCount: number;
  passed: boolean;
}

export interface ReviewConfig {
  /** Minimum score to pass (default: 60) */
  minScore?: number;
  /** Maximum critical findings to pass (default: 0) */
  maxCritical?: number;
  /** Post inline comments on specific files (default: true) */
  inlineComments?: boolean;
  /** Label to apply on failure (default: "needs-architecture-review") */
  failLabel?: string;
  /** Label to apply on pass (default: "architecture-ok") */
  passLabel?: string;
}

/** Adapter for Git operations */
export interface GitAdapter {
  clone(url: string, path: string, branch: string): Promise<void>;
  cleanup(path: string): Promise<void>;
}

/** Adapter for GitHub API operations */
export interface GitHubAdapter {
  postComment(owner: string, repo: string, prNumber: number, body: string): Promise<void>;
  addLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void>;
  removeLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void>;
  createCheckRun(owner: string, repo: string, sha: string, name: string, status: string, conclusion: string, summary: string): Promise<void>;
}

/** Adapter for running the Nexus pipeline */
export interface PipelineRunner {
  run(projectPath: string): Promise<PipelineResult>;
}

export interface PipelineResult {
  score: number;
  findings: ReviewFinding[];
  recommendations: string[];
  duration: number;
}

export interface ReviewFinding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  file?: string;
  line?: number;
  description: string;
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════
// COMMENT FORMATTER
// ═══════════════════════════════════════════════════════════════

export class CommentFormatter {
  static format(result: PipelineResult, config: Required<ReviewConfig>): ReviewComment {
    const criticalCount = result.findings.filter(f => f.severity === "critical").length;
    const highCount = result.findings.filter(f => f.severity === "high").length;
    const mediumCount = result.findings.filter(f => f.severity === "medium").length;
    const lowCount = result.findings.filter(f => f.severity === "low").length;
    const passed = result.score >= config.minScore && criticalCount <= config.maxCritical;

    const statusEmoji = passed ? "✅" : "❌";
    const statusText = passed ? "PASSED" : "NEEDS ATTENTION";

    const lines: string[] = [
      `## ${statusEmoji} Nexus Architecture Review — ${statusText}`,
      "",
      `**Score: ${result.score}/100** | ${result.findings.length} finding(s) | ${(result.duration / 1000).toFixed(1)}s`,
      "",
    ];

    // Score bar
    const filled = Math.round(result.score / 5);
    const empty = 20 - filled;
    lines.push(`\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${result.score}%`);
    lines.push("");

    // Findings summary
    if (result.findings.length > 0) {
      lines.push("### Findings");
      lines.push("");
      lines.push(`| Severity | Count |`);
      lines.push(`|----------|-------|`);
      if (criticalCount > 0) lines.push(`| 🔴 Critical | ${criticalCount} |`);
      if (highCount > 0) lines.push(`| 🟠 High | ${highCount} |`);
      if (mediumCount > 0) lines.push(`| 🟡 Medium | ${mediumCount} |`);
      if (lowCount > 0) lines.push(`| 🔵 Low | ${lowCount} |`);
      lines.push("");

      // Top findings (max 10)
      const topFindings = result.findings
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 10);

      for (const finding of topFindings) {
        const icon = severityIcon(finding.severity);
        const location = finding.file ? ` \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
        lines.push(`- ${icon} **${finding.title}**${location}`);
        lines.push(`  ${finding.description}`);
      }
      lines.push("");
    }

    // Recommendations
    if (result.recommendations.length > 0) {
      lines.push("### Recommendations");
      lines.push("");
      for (const rec of result.recommendations.slice(0, 5)) {
        lines.push(`- ${rec}`);
      }
      lines.push("");
    }

    // Footer
    lines.push("---");
    lines.push("*Powered by [Nexus](https://github.com/nicholaskz/nexus) — Autonomous Engineering Intelligence*");

    return {
      body: lines.join("\n"),
      score: result.score,
      findingsCount: result.findings.length,
      criticalCount,
      passed,
    };
  }
}

function severityRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}

function severityIcon(s: string): string {
  return { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" }[s] ?? "⚪";
}

// ═══════════════════════════════════════════════════════════════
// REVIEW HANDLER (framework-agnostic)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_REVIEW_CONFIG: Required<ReviewConfig> = {
  minScore: 60,
  maxCritical: 0,
  inlineComments: true,
  failLabel: "needs-architecture-review",
  passLabel: "architecture-ok",
};

export class NexusReviewHandler {
  private config: Required<ReviewConfig>;

  constructor(
    private git: GitAdapter,
    private github: GitHubAdapter,
    private pipeline: PipelineRunner,
    config?: ReviewConfig,
  ) {
    this.config = { ...DEFAULT_REVIEW_CONFIG, ...config };
  }

  /**
   * Handle a pull_request webhook event.
   */
  async handlePullRequest(payload: PRWebhookPayload): Promise<ReviewComment> {
    const { repository: repo, pullRequest: pr } = payload;
    const workDir = `/tmp/nexus-review-${repo.name}-${pr.number}-${Date.now()}`;

    try {
      // 1. Clone
      await this.git.clone(repo.cloneUrl, workDir, pr.headBranch);

      // 2. Run pipeline
      const result = await this.pipeline.run(workDir);

      // 3. Format comment
      const comment = CommentFormatter.format(result, this.config);

      // 4. Post comment
      await this.github.postComment(repo.owner, repo.name, pr.number, comment.body);

      // 5. Create check run
      await this.github.createCheckRun(
        repo.owner,
        repo.name,
        pr.headSha,
        "Nexus Architecture Review",
        "completed",
        comment.passed ? "success" : "failure",
        `Score: ${comment.score}/100 | ${comment.findingsCount} finding(s)`,
      );

      // 6. Labels
      if (comment.passed) {
        await this.github.addLabel(repo.owner, repo.name, pr.number, this.config.passLabel);
        await this.safeRemoveLabel(repo.owner, repo.name, pr.number, this.config.failLabel);
      } else {
        await this.github.addLabel(repo.owner, repo.name, pr.number, this.config.failLabel);
        await this.safeRemoveLabel(repo.owner, repo.name, pr.number, this.config.passLabel);
      }

      return comment;
    } finally {
      // Cleanup
      await this.git.cleanup(workDir).catch(() => {});
    }
  }

  private async safeRemoveLabel(owner: string, repo: string, pr: number, label: string): Promise<void> {
    try {
      await this.github.removeLabel(owner, repo, pr, label);
    } catch {
      // Label might not exist — ignore
    }
  }
}
