/**
 * Sentinel Adapter — Transforms Sentinel output into Nexus types
 *
 * Wraps the existing sentinel-method package and translates
 * its ValidationResult into NexusEvents and ValidationSnapshots.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type {
  ValidationSnapshot,
  ValidatorSnapshot,
  ValidationIssueSummary,
  IssueCount,
  Severity,
  NexusEventType,
  NexusLayer,
} from "@nexus/types";
import type { NexusEventBus } from "@nexus/events";

/**
 * Types mirroring Sentinel's ValidationResult structure.
 */
export interface SentinelValidationResult {
  success: boolean;
  timestamp: string;
  sourceDirectory: string;
  duration?: number;
  summary: {
    totalFiles: number;
    passedChecks: number;
    failedChecks: number;
    warnings: number;
  };
  results: Array<{
    validator: string;
    passed: boolean;
    score?: number;
    threshold?: number;
    issues: Array<{
      severity: string;
      code: string;
      message: string;
      file?: string;
      line?: number;
      column?: number;
      suggestion?: string;
    }>;
    details: Record<string, unknown>;
  }>;
  exitCode: number;
}

export interface SentinelConfig {
  testingThreshold?: number;
  securityLevel?: "strict" | "moderate" | "permissive";
  performanceTarget?: "optimal" | "good" | "acceptable";
  maintainabilityScore?: number;
  excludePatterns?: string[];
}

// ═══════════════════════════════════════════════════════════════
// ADAPTER
// ═══════════════════════════════════════════════════════════════

export class SentinelAdapter {
  constructor(
    private eventBus: NexusEventBus,
    private sentinelPath?: string
  ) {}

  /**
   * Run Sentinel validation and convert to Nexus snapshot.
   */
  async validate(
    projectPath: string,
    config?: SentinelConfig,
    sentinelModule?: { validate: (dir: string, config?: SentinelConfig) => Promise<SentinelValidationResult> }
  ): Promise<ValidationSnapshot> {
    const startTime = Date.now();

    const sentinel = sentinelModule ?? await this.loadSentinel();
    const result = await sentinel.validate(projectPath, config);
    const snapshot = this.transformResult(result, projectPath);

    const correlationId = crypto.randomUUID();
    const metadata = {
      projectPath,
      duration: Date.now() - startTime,
    };

    // Emit validation completed event
    await this.eventBus.publish(
      "validation.completed" as NexusEventType,
      "validation" as NexusLayer,
      snapshot,
      metadata,
      correlationId
    );

    // Emit pass/fail event
    const gateEvent = snapshot.success
      ? ("quality_gate.passed" as NexusEventType)
      : ("quality_gate.failed" as NexusEventType);

    await this.eventBus.publish(gateEvent, "validation" as NexusLayer, {
      success: snapshot.success,
      score: snapshot.overallScore,
      failedValidators: snapshot.validators
        .filter((v) => !v.passed)
        .map((v) => v.name),
    }, metadata, correlationId);

    // Emit individual critical/high issues
    for (const validator of snapshot.validators) {
      for (const issue of validator.topIssues) {
        if (issue.severity === "critical" || issue.severity === "high") {
          await this.eventBus.publish(
            "issue.found" as NexusEventType,
            "validation" as NexusLayer,
            { validator: validator.name, ...issue },
            metadata,
            correlationId
          );
        }
      }
    }

    return snapshot;
  }

  /**
   * Transform Sentinel's ValidationResult into Nexus ValidationSnapshot.
   */
  private transformResult(
    result: SentinelValidationResult,
    projectPath: string
  ): ValidationSnapshot {
    const validators: ValidatorSnapshot[] = result.results.map((r) => {
      const issues: ValidationIssueSummary[] = r.issues
        .sort((a, b) => this.severityOrder(a.severity) - this.severityOrder(b.severity))
        .slice(0, 10) // Top 10 issues per validator
        .map((i) => ({
          severity: this.mapSeverity(i.severity),
          code: i.code,
          message: i.message,
          file: i.file,
          line: i.line,
          suggestion: i.suggestion,
        }));

      return {
        name: r.validator,
        passed: r.passed,
        score: r.score ?? (r.passed ? 100 : 0),
        threshold: r.threshold ?? 70,
        issueCount: r.issues.length,
        topIssues: issues,
      };
    });

    const issueCount = this.countIssues(result);

    const scores = validators.map((v) => v.score).filter((s) => s > 0);
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return {
      projectPath,
      timestamp: result.timestamp,
      success: result.success,
      overallScore,
      validators,
      issueCount,
      duration: result.duration ?? 0,
    };
  }

  private countIssues(result: SentinelValidationResult): IssueCount {
    const count: IssueCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
    for (const r of result.results) {
      for (const issue of r.issues) {
        const sev = this.mapSeverity(issue.severity);
        if (sev in count) {
          count[sev as keyof Omit<IssueCount, "total">]++;
        }
        count.total++;
      }
    }
    return count;
  }

  private mapSeverity(severity: string): Severity {
    const map: Record<string, Severity> = {
      error: "critical" as Severity,
      critical: "critical" as Severity,
      warning: "high" as Severity,
      high: "high" as Severity,
      medium: "medium" as Severity,
      info: "info" as Severity,
      low: "low" as Severity,
    };
    return map[severity.toLowerCase()] ?? ("medium" as Severity);
  }

  private severityOrder(severity: string): number {
    const order: Record<string, number> = {
      error: 0, critical: 0, high: 1, warning: 1,
      medium: 2, low: 3, info: 4,
    };
    return order[severity.toLowerCase()] ?? 5;
  }

  private async loadSentinel(): Promise<{
    validate: (dir: string, config?: SentinelConfig) => Promise<SentinelValidationResult>;
  }> {
    try {
      const mod = await import(this.sentinelPath ?? "sentinel-method");
      const Sentinel = mod.Sentinel ?? mod.default;
      const instance = new Sentinel();
      return { validate: (dir, config) => instance.validate(dir, config) };
    } catch {
      throw new Error(
        "Could not load sentinel-method. Install it with: npm install sentinel-method"
      );
    }
  }
}
