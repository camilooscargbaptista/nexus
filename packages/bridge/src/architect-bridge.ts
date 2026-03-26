/**
 * Architect Bridge — Transforms raw Architect v4 output into the
 * ArchitectAnalysisReport format expected by ArchitectAdapter.
 *
 * This bridge handles the structural differences between:
 *   - Architect's native AnalysisReport (projectInfo.totalFiles, dependencyGraph.edges, etc.)
 *   - Bridge's ArchitectAnalysisReport (projectInfo.files, dependencies, etc.)
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// RAW ARCHITECT TYPES (mirrors architect/src/types.ts)
// ═══════════════════════════════════════════════════════════════

/** Raw AnalysisReport from @girardelli/architect */
export interface RawArchitectReport {
  timestamp: string;
  projectInfo: {
    path: string;
    name: string;
    frameworks: string[];
    totalFiles: number;
    totalLines: number;
    primaryLanguages: string[];
    fileTree?: unknown;
  };
  score: {
    overall: number;
    components?: unknown[];
    breakdown: {
      modularity: number;
      coupling: number;
      cohesion: number;
      layering: number;
    };
  };
  layers: Array<{
    name: string;
    files: string[];
    description?: string;
  }>;
  antiPatterns: Array<{
    name: string;
    severity: string;
    location: string;
    description: string;
    suggestion: string;
    affectedFiles?: string[];
    metrics?: Record<string, number | string>;
  }>;
  dependencyGraph: {
    nodes: string[];
    edges: Array<{
      from: string;
      to: string;
      type: string;
      weight: number;
    }>;
  };
  suggestions?: unknown[];
  diagram?: unknown;
  projectSummary?: unknown;
}

/** The architect module's public API */
export interface RawArchitectModule {
  analyze: (path: string, onProgress?: unknown) => Promise<RawArchitectReport>;
  refactor?: (report: RawArchitectReport, projectPath: string) => unknown;
}

// ═══════════════════════════════════════════════════════════════
// BRIDGED OUTPUT (matches ArchitectAnalysisReport in adapter)
// ═══════════════════════════════════════════════════════════════

export interface BridgedAnalysisReport {
  projectInfo: {
    name: string;
    path: string;
    files: number;
    lines?: number;
    frameworks?: string[];
    domain?: string;
  };
  score: {
    overall: number;
    breakdown: {
      modularity: number;
      coupling: number;
      cohesion: number;
      layering: number;
    };
  };
  layers: Array<{
    name: string;
    type: string;
    files: string[];
  }>;
  antiPatterns: Array<{
    name: string;
    severity: string;
    location: string;
    description: string;
    files?: string[];
    suggestion?: string;
  }>;
  dependencies: Array<{
    source: string;
    target: string;
    type?: string;
    weight?: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// DOMAIN DETECTION
// ═══════════════════════════════════════════════════════════════

const DOMAIN_SIGNALS: Record<string, string[]> = {
  fintech: ["stripe", "payment", "banking", "transaction", "ledger", "plaid"],
  healthtech: ["patient", "medical", "health", "dicom", "hl7", "fhir"],
  ecommerce: ["cart", "checkout", "product", "order", "inventory", "shopify"],
  edtech: ["course", "student", "lesson", "quiz", "lms", "classroom"],
  saas: ["tenant", "subscription", "billing", "plan", "workspace"],
  devtools: ["ast", "parser", "linter", "compiler", "cli", "plugin", "analyzer"],
};

function inferDomain(report: RawArchitectReport): string | undefined {
  const allFiles = report.dependencyGraph.nodes.join(" ").toLowerCase();
  const frameworks = report.projectInfo.frameworks.join(" ").toLowerCase();
  const haystack = `${allFiles} ${frameworks}`;

  let bestDomain: string | undefined;
  let bestCount = 0;

  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS)) {
    const count = signals.filter((s) => haystack.includes(s)).length;
    if (count > bestCount) {
      bestCount = count;
      bestDomain = domain;
    }
  }

  return bestCount >= 2 ? bestDomain : undefined;
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a bridge that wraps the raw Architect module and transforms
 * its output into the format expected by ArchitectAdapter.
 *
 * Usage:
 *   const mod = await import("@girardelli/architect");
 *   const bridge = createArchitectBridge(mod.architect);
 *   const report = await bridge.analyze("./my-project");
 */
export function createArchitectBridge(
  rawArchitect: RawArchitectModule,
): { analyze: (path: string) => Promise<BridgedAnalysisReport> } {
  return {
    analyze: async (projectPath: string): Promise<BridgedAnalysisReport> => {
      const raw = await rawArchitect.analyze(projectPath);
      return transformReport(raw);
    },
  };
}

/**
 * Transform a raw Architect AnalysisReport into the bridged format.
 * Exported for direct use in tests and integration scenarios.
 */
export function transformReport(raw: RawArchitectReport): BridgedAnalysisReport {
  return {
    projectInfo: {
      name: raw.projectInfo.name,
      path: raw.projectInfo.path,
      files: raw.projectInfo.totalFiles,
      lines: raw.projectInfo.totalLines,
      frameworks: raw.projectInfo.frameworks,
      domain: inferDomain(raw),
    },
    score: {
      overall: raw.score.overall,
      breakdown: { ...raw.score.breakdown },
    },
    layers: raw.layers.map((l) => ({
      name: l.name,
      type: l.name.toLowerCase(),
      files: l.files,
    })),
    antiPatterns: raw.antiPatterns.map((ap) => ({
      name: ap.name,
      severity: ap.severity,
      location: ap.location,
      description: ap.description,
      files: ap.affectedFiles,
      suggestion: ap.suggestion,
    })),
    dependencies: raw.dependencyGraph.edges.map((e) => ({
      source: e.from,
      target: e.to,
      type: e.type,
      weight: e.weight,
    })),
  };
}
