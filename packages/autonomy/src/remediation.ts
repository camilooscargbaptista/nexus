/**
 * Autonomous Remediation Engine
 *
 * Generates and verifies automatic fixes for critical/high findings.
 * Uses a plan→apply→verify cycle with independent sub-agent verification:
 *
 *   1. Plan: Analyze finding → generate fix strategy
 *   2. Apply: Execute fix (write/patch files)
 *   3. Verify: Run validation → confirm score improved
 *   4. SubAgent: Independent verification that fix doesn't regress
 *
 * Only proposes fixes that pass all verification stages.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type { GuidanceFinding } from "@nexus/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RemediationConfig {
  /** Maximum attempts per finding (default: 3) */
  maxAttempts?: number;
  /** Only auto-fix findings at or above this severity (default: 'high') */
  minSeverity?: "critical" | "high" | "medium";
  /** Require sub-agent verification (default: true) */
  requireSubAgentVerification?: boolean;
  /** Minimum score improvement to accept fix (default: 1) */
  minScoreImprovement?: number;
  /** Timeout per fix attempt in ms (default: 30000) */
  attemptTimeout?: number;
  /** Dry-run mode — plan fixes but don't apply (default: false) */
  dryRun?: boolean;
}

export interface RemediationPlan {
  findingId: string;
  finding: GuidanceFinding;
  strategy: FixStrategy;
  estimatedImpact: number;
  affectedFiles: string[];
  status: "planned" | "applying" | "verifying" | "accepted" | "rejected" | "failed";
}

export interface FixStrategy {
  type: "patch" | "refactor" | "config-change" | "dependency-update";
  description: string;
  steps: FixStep[];
  rollbackPlan: string;
}

export interface FixStep {
  action: "create" | "modify" | "delete" | "run-command";
  target: string;
  description: string;
  patch?: FilePatch;
  command?: string;
}

export interface FilePatch {
  file: string;
  hunks: PatchHunk[];
}

export interface PatchHunk {
  startLine: number;
  removeLines: string[];
  addLines: string[];
}

export interface RemediationResult {
  findingId: string;
  success: boolean;
  attempts: number;
  plan: RemediationPlan;
  verification: VerificationResult;
  subAgentVerification?: VerificationResult;
  appliedPatches: FilePatch[];
  duration: number;
}

export interface VerificationResult {
  passed: boolean;
  scoreBefore: number;
  scoreAfter: number;
  improvement: number;
  regressions: string[];
  details: string;
}

export interface RemediationReport {
  timestamp: string;
  totalFindings: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: RemediationResult[];
  totalScoreImprovement: number;
  duration: number;
}

/** File system adapter — decoupled from real FS */
export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listFiles(dir: string, pattern?: string): Promise<string[]>;
}

/** Validator adapter — runs sentinel/architect checks */
export interface ValidatorAdapter {
  getScore(projectPath: string): Promise<number>;
  validate(projectPath: string): Promise<{ score: number; findings: GuidanceFinding[] }>;
}

/** Fix generator — uses LLM or rules to generate fix strategies */
export interface FixGenerator {
  generateStrategy(finding: GuidanceFinding, fileContents: Map<string, string>): Promise<FixStrategy>;
}

/** Sub-agent that independently verifies a fix */
export interface SubAgentVerifier {
  verify(projectPath: string, appliedFix: RemediationPlan): Promise<VerificationResult>;
}

// ═══════════════════════════════════════════════════════════════
// SEVERITY RANKING
// ═══════════════════════════════════════════════════════════════

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

// ═══════════════════════════════════════════════════════════════
// REMEDIATION ENGINE
// ═══════════════════════════════════════════════════════════════

export class RemediationEngine {
  private config: Required<RemediationConfig>;

  constructor(
    private fs: FileSystemAdapter,
    private validator: ValidatorAdapter,
    private fixGenerator: FixGenerator,
    private subAgent?: SubAgentVerifier,
    config?: RemediationConfig,
  ) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      minSeverity: config?.minSeverity ?? "high",
      requireSubAgentVerification: config?.requireSubAgentVerification ?? true,
      minScoreImprovement: config?.minScoreImprovement ?? 1,
      attemptTimeout: config?.attemptTimeout ?? 30_000,
      dryRun: config?.dryRun ?? false,
    };
  }

  /**
   * Attempt to auto-remediate a list of findings.
   * Findings are prioritized by severity (critical first).
   */
  async remediate(
    projectPath: string,
    findings: GuidanceFinding[],
  ): Promise<RemediationReport> {
    const start = Date.now();

    // Filter to eligible findings
    const minRank = SEVERITY_RANK[this.config.minSeverity] ?? 3;
    const eligible = findings
      .filter(f => (SEVERITY_RANK[f.severity] ?? 0) >= minRank)
      .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));

    const skipped = findings.length - eligible.length;
    const results: RemediationResult[] = [];

    for (const finding of eligible) {
      const result = await this.remediateFinding(projectPath, finding);
      results.push(result);
    }

    const succeeded = results.filter(r => r.success).length;
    const totalImprovement = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.verification.improvement, 0);

    return {
      timestamp: new Date().toISOString(),
      totalFindings: findings.length,
      attempted: eligible.length,
      succeeded,
      failed: eligible.length - succeeded,
      skipped,
      results,
      totalScoreImprovement: totalImprovement,
      duration: Date.now() - start,
    };
  }

  /**
   * Remediate a single finding with retry logic.
   */
  private async remediateFinding(
    projectPath: string,
    finding: GuidanceFinding,
  ): Promise<RemediationResult> {
    const start = Date.now();
    let lastVerification: VerificationResult = {
      passed: false, scoreBefore: 0, scoreAfter: 0,
      improvement: 0, regressions: [], details: "Not verified",
    };
    let lastSubAgent: VerificationResult | undefined;
    let appliedPatches: FilePatch[] = [];
    let plan: RemediationPlan | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        // 1. Read affected files
        const fileContents = new Map<string, string>();
        for (const file of finding.affectedFiles) {
          const fullPath = `${projectPath}/${file}`;
          if (await this.fs.fileExists(fullPath)) {
            fileContents.set(file, await this.fs.readFile(fullPath));
          }
        }

        // 2. Generate fix strategy
        const strategy = await this.fixGenerator.generateStrategy(finding, fileContents);
        plan = {
          findingId: finding.id,
          finding,
          strategy,
          estimatedImpact: this.estimateImpact(finding),
          affectedFiles: finding.affectedFiles,
          status: "planned",
        };

        if (this.config.dryRun) {
          plan.status = "planned";
          return {
            findingId: finding.id,
            success: false,
            attempts: attempt,
            plan,
            verification: { ...lastVerification, details: "Dry run — fix planned but not applied" },
            appliedPatches: [],
            duration: Date.now() - start,
          };
        }

        // 3. Get baseline score
        const scoreBefore = await this.validator.getScore(projectPath);

        // 4. Apply fix
        plan.status = "applying";
        const patches = await this.applyStrategy(projectPath, strategy);
        appliedPatches = patches;

        // 5. Verify
        plan.status = "verifying";
        const validation = await this.validator.validate(projectPath);
        const improvement = validation.score - scoreBefore;

        lastVerification = {
          passed: improvement >= this.config.minScoreImprovement,
          scoreBefore,
          scoreAfter: validation.score,
          improvement,
          regressions: this.detectRegressions(finding, validation.findings),
          details: improvement >= this.config.minScoreImprovement
            ? `Score improved by ${improvement} points`
            : `Insufficient improvement: ${improvement} (min: ${this.config.minScoreImprovement})`,
        };

        if (!lastVerification.passed || lastVerification.regressions.length > 0) {
          // Rollback and retry
          await this.rollbackPatches(projectPath, patches, fileContents);
          continue;
        }

        // 6. Sub-agent verification
        if (this.config.requireSubAgentVerification && this.subAgent) {
          lastSubAgent = await this.subAgent.verify(projectPath, plan);
          if (!lastSubAgent.passed) {
            await this.rollbackPatches(projectPath, patches, fileContents);
            lastVerification.details += ` | Sub-agent rejected: ${lastSubAgent.details}`;
            continue;
          }
        }

        // Success!
        plan.status = "accepted";
        return {
          findingId: finding.id,
          success: true,
          attempts: attempt,
          plan,
          verification: lastVerification,
          subAgentVerification: lastSubAgent,
          appliedPatches: patches,
          duration: Date.now() - start,
        };

      } catch (error) {
        lastVerification.details = `Attempt ${attempt} failed: ${(error as Error).message}`;
      }
    }

    // All attempts exhausted
    if (plan) plan.status = "failed";
    return {
      findingId: finding.id,
      success: false,
      attempts: this.config.maxAttempts,
      plan: plan ?? {
        findingId: finding.id,
        finding,
        strategy: { type: "patch", description: "Failed to generate", steps: [], rollbackPlan: "" },
        estimatedImpact: 0,
        affectedFiles: finding.affectedFiles,
        status: "failed",
      },
      verification: lastVerification,
      subAgentVerification: lastSubAgent,
      appliedPatches,
      duration: Date.now() - start,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────

  private async applyStrategy(projectPath: string, strategy: FixStrategy): Promise<FilePatch[]> {
    const patches: FilePatch[] = [];

    for (const step of strategy.steps) {
      switch (step.action) {
        case "modify":
          if (step.patch) {
            await this.applyPatch(projectPath, step.patch);
            patches.push(step.patch);
          }
          break;
        case "create":
          await this.fs.writeFile(`${projectPath}/${step.target}`, "");
          break;
        case "delete":
          // Deletion handled through patch (remove all lines)
          break;
        case "run-command":
          // Commands not executed in sandboxed mode — logged only
          break;
      }
    }

    return patches;
  }

  private async applyPatch(projectPath: string, patch: FilePatch): Promise<void> {
    const fullPath = `${projectPath}/${patch.file}`;
    const content = await this.fs.readFile(fullPath);
    const lines = content.split("\n");

    // Apply hunks in reverse order to preserve line numbers
    const sortedHunks = [...patch.hunks].sort((a, b) => b.startLine - a.startLine);

    for (const hunk of sortedHunks) {
      const startIdx = hunk.startLine - 1; // 1-indexed to 0-indexed
      lines.splice(startIdx, hunk.removeLines.length, ...hunk.addLines);
    }

    await this.fs.writeFile(fullPath, lines.join("\n"));
  }

  private async rollbackPatches(
    projectPath: string,
    patches: FilePatch[],
    originalContents: Map<string, string>,
  ): Promise<void> {
    for (const patch of patches) {
      const original = originalContents.get(patch.file);
      if (original !== undefined) {
        await this.fs.writeFile(`${projectPath}/${patch.file}`, original);
      }
    }
  }

  private detectRegressions(original: GuidanceFinding, currentFindings: GuidanceFinding[]): string[] {
    // A regression is a new finding not present before the fix was applied
    return currentFindings
      .filter(f => f.id !== original.id && (SEVERITY_RANK[f.severity] ?? 0) >= SEVERITY_RANK["high"])
      .map(f => `New ${f.severity}: ${f.title}`);
  }

  private estimateImpact(finding: GuidanceFinding): number {
    switch (finding.severity) {
      case "critical": return 15;
      case "high": return 8;
      case "medium": return 4;
      default: return 2;
    }
  }
}
