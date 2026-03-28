/**
 * Drift Detector — Compare ADR decisions with actual implementation
 *
 * Reads Architecture Decision Records (ADRs) and compares declared
 * constraints with the real codebase state to detect drift:
 *   - Technology choices not followed
 *   - Layer violations from declared architecture
 *   - Dependency constraints broken
 *   - Pattern mandates not implemented
 *   - Deprecated tech still in use
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type {
  ArchitectureSnapshot,
  GuidanceFinding,
} from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ADRConstraint {
  adrId: string;
  title: string;
  status: "accepted" | "superseded" | "deprecated";
  date: string;
  constraints: ArchConstraint[];
}

export type ConstraintType =
  | "technology-mandate"
  | "technology-ban"
  | "layer-rule"
  | "dependency-rule"
  | "pattern-mandate"
  | "naming-rule";

export interface ArchConstraint {
  type: ConstraintType;
  description: string;
  /** Rule-specific params */
  rule: Record<string, unknown>;
}

export interface DriftResult {
  timestamp: string;
  adrsEvaluated: number;
  constraintsChecked: number;
  drifts: DriftViolation[];
  compliant: ComplianceRecord[];
  driftScore: number;
  summary: string;
}

export interface DriftViolation {
  adrId: string;
  adrTitle: string;
  constraintType: ConstraintType;
  description: string;
  evidence: string[];
  severity: "critical" | "high" | "medium" | "low";
  recommendation: string;
}

export interface ComplianceRecord {
  adrId: string;
  constraintType: ConstraintType;
  description: string;
}

/** Adapter for reading codebase state — decoupled from file system */
export interface CodebaseInspector {
  /** Get all import statements mapped by file */
  getImports(): Map<string, string[]>;
  /** Get all file paths in the project */
  getFiles(): string[];
  /** Check if a specific pattern/technology is used */
  findUsages(pattern: string): { file: string; line: number; snippet: string }[];
  /** Get detected layers/modules from architecture snapshot */
  getLayers(): Map<string, string[]>;
}

// ═══════════════════════════════════════════════════════════════
// DRIFT CHECKERS
// ═══════════════════════════════════════════════════════════════

type DriftChecker = (
  constraint: ArchConstraint,
  adr: ADRConstraint,
  inspector: CodebaseInspector,
) => { violations: DriftViolation[]; compliant: boolean };

const CHECKERS: Record<ConstraintType, DriftChecker> = {
  "technology-mandate": (constraint, adr, inspector) => {
    const tech = constraint.rule.technology as string;
    const scope = constraint.rule.scope as string | undefined;
    const usages = inspector.findUsages(tech);

    if (usages.length === 0) {
      return {
        violations: [{
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "technology-mandate",
          description: `ADR mandates '${tech}'${scope ? ` in ${scope}` : ""} but no usage found`,
          evidence: ["No imports or references found in codebase"],
          severity: "high",
          recommendation: `Implement '${tech}' as mandated by ${adr.adrId}, or update the ADR if the decision has changed`,
        }],
        compliant: false,
      };
    }

    return { violations: [], compliant: true };
  },

  "technology-ban": (constraint, adr, inspector) => {
    const banned = constraint.rule.technology as string;
    const reason = constraint.rule.reason as string ?? "banned by ADR";
    const usages = inspector.findUsages(banned);

    if (usages.length > 0) {
      return {
        violations: [{
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "technology-ban",
          description: `ADR bans '${banned}' but ${usages.length} usage(s) found`,
          evidence: usages.slice(0, 5).map(u => `${u.file}:${u.line} — ${u.snippet}`),
          severity: "medium",
          recommendation: `Remove '${banned}' (${reason}) — ${adr.adrId}`,
        }],
        compliant: false,
      };
    }

    return { violations: [], compliant: true };
  },

  "layer-rule": (constraint, adr, inspector) => {
    const from = constraint.rule.from as string;
    const cannotImport = constraint.rule.cannotImport as string;
    const layers = inspector.getLayers();
    const imports = inspector.getImports();

    const fromFiles = layers.get(from) ?? [];
    const targetFiles = new Set(layers.get(cannotImport) ?? []);
    const violations: DriftViolation[] = [];

    for (const file of fromFiles) {
      const fileImports = imports.get(file) ?? [];
      const badImports = fileImports.filter(imp =>
        Array.from(targetFiles).some(t => imp.includes(t)),
      );

      if (badImports.length > 0) {
        violations.push({
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "layer-rule",
          description: `Layer '${from}' imports from forbidden layer '${cannotImport}'`,
          evidence: badImports.map(imp => `${file} → ${imp}`),
          severity: "high",
          recommendation: `Refactor '${file}' to remove dependency on '${cannotImport}' layer`,
        });
      }
    }

    return { violations, compliant: violations.length === 0 };
  },

  "dependency-rule": (constraint, adr, inspector) => {
    const maxDeps = constraint.rule.maxDependencies as number | undefined;
    const requiredDep = constraint.rule.required as string | undefined;
    const forbiddenDep = constraint.rule.forbidden as string | undefined;
    const violations: DriftViolation[] = [];

    if (forbiddenDep) {
      const usages = inspector.findUsages(forbiddenDep);
      if (usages.length > 0) {
        violations.push({
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "dependency-rule",
          description: `Forbidden dependency '${forbiddenDep}' found in codebase`,
          evidence: usages.slice(0, 5).map(u => `${u.file}:${u.line}`),
          severity: "medium",
          recommendation: `Replace '${forbiddenDep}' with approved alternative`,
        });
      }
    }

    if (requiredDep) {
      const usages = inspector.findUsages(requiredDep);
      if (usages.length === 0) {
        violations.push({
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "dependency-rule",
          description: `Required dependency '${requiredDep}' not found`,
          evidence: [],
          severity: "low",
          recommendation: `Add '${requiredDep}' as required by ${adr.adrId}`,
        });
      }
    }

    if (maxDeps !== undefined) {
      const imports = inspector.getImports();
      for (const [file, fileImports] of imports.entries()) {
        if (fileImports.length > maxDeps) {
          violations.push({
            adrId: adr.adrId,
            adrTitle: adr.title,
            constraintType: "dependency-rule",
            description: `File '${file}' has ${fileImports.length} dependencies (max: ${maxDeps})`,
            evidence: [`${file}: ${fileImports.length} imports`],
            severity: "low",
            recommendation: `Reduce dependencies in '${file}' to ≤ ${maxDeps}`,
          });
        }
      }
    }

    return { violations, compliant: violations.length === 0 };
  },

  "pattern-mandate": (constraint, adr, inspector) => {
    const pattern = constraint.rule.pattern as string;
    const scope = constraint.rule.scope as string | undefined;
    const usages = inspector.findUsages(pattern);

    if (usages.length === 0) {
      return {
        violations: [{
          adrId: adr.adrId,
          adrTitle: adr.title,
          constraintType: "pattern-mandate",
          description: `Mandated pattern '${pattern}'${scope ? ` in ${scope}` : ""} not found`,
          evidence: [],
          severity: "medium",
          recommendation: `Implement '${pattern}' as mandated by ${adr.adrId}`,
        }],
        compliant: false,
      };
    }

    return { violations: [], compliant: true };
  },

  "naming-rule": (constraint, adr, inspector) => {
    const regex = new RegExp(constraint.rule.pattern as string);
    const scope = constraint.rule.scope as string ?? "";
    const files = inspector.getFiles();
    const violations: DriftViolation[] = [];

    const scopedFiles = scope
      ? files.filter(f => f.includes(scope))
      : files;

    const nonCompliant = scopedFiles.filter(f => !regex.test(f));
    if (nonCompliant.length > 0) {
      violations.push({
        adrId: adr.adrId,
        adrTitle: adr.title,
        constraintType: "naming-rule",
        description: `${nonCompliant.length} files violate naming convention '${constraint.rule.pattern}'`,
        evidence: nonCompliant.slice(0, 10),
        severity: "low",
        recommendation: `Rename files to match pattern '${constraint.rule.pattern}'`,
      });
    }

    return { violations, compliant: violations.length === 0 };
  },
};

// ═══════════════════════════════════════════════════════════════
// DRIFT DETECTOR
// ═══════════════════════════════════════════════════════════════

export class DriftDetector {
  constructor(private inspector: CodebaseInspector) {}

  /**
   * Evaluate all ADR constraints against the current codebase.
   */
  detect(adrs: ADRConstraint[]): DriftResult {
    const activeAdrs = adrs.filter(a => a.status === "accepted");
    const violations: DriftViolation[] = [];
    const compliant: ComplianceRecord[] = [];
    let constraintsChecked = 0;

    for (const adr of activeAdrs) {
      for (const constraint of adr.constraints) {
        constraintsChecked++;
        const checker = CHECKERS[constraint.type];
        if (!checker) continue;

        const result = checker(constraint, adr, this.inspector);
        violations.push(...result.violations);

        if (result.compliant) {
          compliant.push({
            adrId: adr.adrId,
            constraintType: constraint.type,
            description: constraint.description,
          });
        }
      }
    }

    const driftScore = constraintsChecked > 0
      ? Math.round((compliant.length / constraintsChecked) * 100)
      : 100;

    const summary = this.generateSummary(violations, compliant, driftScore);

    return {
      timestamp: new Date().toISOString(),
      adrsEvaluated: activeAdrs.length,
      constraintsChecked,
      drifts: violations,
      compliant,
      driftScore,
      summary,
    };
  }

  /**
   * Convert drift violations to GuidanceFinding format for integration
   * with the Nexus guidance pipeline.
   */
  toFindings(result: DriftResult): GuidanceFinding[] {
    return result.drifts.map((drift, i) => ({
      id: `drift-${drift.adrId}-${i}`,
      title: `Architectural Drift: ${drift.description}`,
      description: `${drift.description}\n\nEvidence:\n${drift.evidence.join("\n")}`,
      severity: drift.severity as unknown as GuidanceFinding["severity"],
      skillSource: "drift-detector",
      affectedFiles: drift.evidence.slice(0, 5),
    }));
  }

  private generateSummary(
    violations: DriftViolation[],
    compliant: ComplianceRecord[],
    score: number,
  ): string {
    if (violations.length === 0) {
      return `Architecture fully compliant — ${compliant.length} constraints verified, score: ${score}%`;
    }

    const critical = violations.filter(v => v.severity === "critical").length;
    const high = violations.filter(v => v.severity === "high").length;

    const parts = [`Drift score: ${score}%`];
    if (critical > 0) parts.push(`${critical} critical drift(s)`);
    if (high > 0) parts.push(`${high} high drift(s)`);
    parts.push(`${compliant.length}/${compliant.length + violations.length} constraints compliant`);

    return parts.join(" — ");
  }
}
