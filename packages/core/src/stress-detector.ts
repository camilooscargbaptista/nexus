/**
 * @camilooscargbaptista/nexus-core — Stress Detector
 *
 * Analisa patterns de estresse no codebase: code smells,
 * anti-patterns, developer frustration indicators.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface StressIndicator {
  id: string;
  category: "code-smell" | "anti-pattern" | "frustration" | "tech-debt";
  severity: "low" | "medium" | "high" | "critical";
  count: number;
  description: string;
  locations?: string[];
}

export interface StressReport {
  /** Score de estresse (0 = saudável, 100 = em apuros) */
  stressScore: number;
  /** Nível geral de estresse */
  stressLevel: "low" | "moderate" | "high" | "critical";
  /** Indicadores detectados */
  indicators: StressIndicator[];
  /** Top 3 áreas mais problemáticas */
  hotspots: string[];
  /** Recomendações priorizadas */
  recommendations: string[];
}

export interface SourceAnalysis {
  /** Conteúdo do arquivo ou resultado de análise */
  content: string;
  /** Caminho do arquivo */
  filePath: string;
}

// ═══════════════════════════════════════════════════════════════
// DETECTOR PATTERNS
// ═══════════════════════════════════════════════════════════════

interface DetectorRule {
  id: string;
  category: StressIndicator["category"];
  severity: StressIndicator["severity"];
  pattern: RegExp;
  description: string;
}

const DETECTOR_RULES: DetectorRule[] = [
  // Frustration indicators
  { id: "todo", category: "frustration", severity: "low", pattern: /\bTODO\b/gi, description: "TODO markers" },
  { id: "fixme", category: "frustration", severity: "medium", pattern: /\bFIXME\b/gi, description: "FIXME markers" },
  { id: "hack", category: "frustration", severity: "high", pattern: /\bHACK\b/gi, description: "HACK markers" },
  { id: "wtf", category: "frustration", severity: "high", pattern: /\bWTF\b/g, description: "WTF markers" },
  { id: "xxx", category: "frustration", severity: "medium", pattern: /\bXXX\b/g, description: "XXX markers" },

  // Code smells
  { id: "any-type", category: "code-smell", severity: "medium", pattern: /:\s*any\b/g, description: "TypeScript `any` type usage" },
  { id: "console-log", category: "code-smell", severity: "low", pattern: /console\.(log|warn|error)\(/g, description: "Console.log statements" },
  { id: "magic-number", category: "code-smell", severity: "low", pattern: /(?<![.\d])\b(?:[2-9]\d{2,}|[1-9]\d{3,})\b(?!\.\d)/g, description: "Magic numbers (>= 200)" },
  { id: "long-function", category: "code-smell", severity: "medium", pattern: /(?:function|=>)\s*\([^)]*\)[^{]*\{/g, description: "Function declarations (check length)" },

  // Anti-patterns
  { id: "nested-callbacks", category: "anti-pattern", severity: "high", pattern: /\.then\([^)]*\.then\(/g, description: "Nested .then() callbacks" },
  { id: "eval-usage", category: "anti-pattern", severity: "critical", pattern: /\beval\s*\(/g, description: "eval() usage" },
  { id: "disable-eslint", category: "anti-pattern", severity: "medium", pattern: /eslint-disable/g, description: "ESLint disable comments" },

  // Tech debt
  { id: "deprecated", category: "tech-debt", severity: "medium", pattern: /@deprecated/gi, description: "Deprecated markers" },
  { id: "temp-code", category: "tech-debt", severity: "high", pattern: /\b(TEMP|TEMPORARY)\b/gi, description: "Temporary code markers" },
  { id: "hardcoded-url", category: "tech-debt", severity: "medium", pattern: /https?:\/\/(?:localhost|127\.0\.0\.1)/g, description: "Hardcoded localhost URLs" },
];

// ═══════════════════════════════════════════════════════════════
// STRESS DETECTOR
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta patterns de estresse e tech debt no código fonte.
 *
 * @example
 * ```ts
 * const detector = new StressDetector();
 * const report = detector.analyze([
 *   { content: sourceCode, filePath: "src/auth.ts" }
 * ]);
 * // report.stressLevel === "moderate"
 * // report.hotspots === ["src/auth.ts"]
 * ```
 */
export class StressDetector {
  private rules: DetectorRule[];

  constructor(additionalRules?: DetectorRule[]) {
    this.rules = [...DETECTOR_RULES, ...(additionalRules ?? [])];
  }

  /**
   * Analisa um conjunto de arquivos e gera relatório de estresse.
   */
  analyze(sources: SourceAnalysis[]): StressReport {
    const allIndicators: StressIndicator[] = [];
    const fileScores = new Map<string, number>();

    for (const source of sources) {
      const indicators = this.scanSource(source);
      allIndicators.push(...indicators);

      // Aggregate score per file
      const fileScore = indicators.reduce((sum, ind) => {
        const weight = { low: 1, medium: 2, high: 4, critical: 8 }[ind.severity];
        return sum + ind.count * weight;
      }, 0);
      fileScores.set(source.filePath, fileScore);
    }

    // Merge same-id indicators
    const merged = this.mergeIndicators(allIndicators);

    // Compute stress score
    const totalWeight = merged.reduce((sum, ind) => {
      const weight = { low: 1, medium: 2, high: 4, critical: 8 }[ind.severity];
      return sum + ind.count * weight;
    }, 0);

    const stressScore = Math.min(100, Math.round(totalWeight / Math.max(sources.length, 1)));

    const stressLevel: StressReport["stressLevel"] =
      stressScore >= 75 ? "critical"
        : stressScore >= 50 ? "high"
          : stressScore >= 25 ? "moderate" : "low";

    // Top 3 hotspots
    const hotspots = [...fileScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([path]) => path);

    // Recommendations
    const recommendations = this.generateRecommendations(merged);

    return {
      stressScore,
      stressLevel,
      indicators: merged,
      hotspots,
      recommendations,
    };
  }

  /**
   * Escaneia um único arquivo.
   */
  private scanSource(source: SourceAnalysis): StressIndicator[] {
    const indicators: StressIndicator[] = [];

    for (const rule of this.rules) {
      const matches = source.content.match(rule.pattern);
      if (matches && matches.length > 0) {
        indicators.push({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
          count: matches.length,
          description: rule.description,
          locations: [source.filePath],
        });
      }
    }

    return indicators;
  }

  /**
   * Merge indicadores com mesmo ID.
   */
  private mergeIndicators(indicators: StressIndicator[]): StressIndicator[] {
    const map = new Map<string, StressIndicator>();

    for (const ind of indicators) {
      const existing = map.get(ind.id);
      if (existing) {
        existing.count += ind.count;
        if (ind.locations) {
          existing.locations = [...(existing.locations ?? []), ...ind.locations];
        }
      } else {
        map.set(ind.id, { ...ind, locations: [...(ind.locations ?? [])] });
      }
    }

    return [...map.values()].sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count;
    });
  }

  /**
   * Gera recomendações priorizadas.
   */
  private generateRecommendations(indicators: StressIndicator[]): string[] {
    const recs: string[] = [];

    const criticals = indicators.filter((i) => i.severity === "critical");
    if (criticals.length > 0) {
      recs.push(`🔴 Address ${criticals.length} critical issue(s): ${criticals.map((c) => c.description).join(", ")}`);
    }

    const frustrations = indicators.filter((i) => i.category === "frustration");
    const totalFrustration = frustrations.reduce((s, f) => s + f.count, 0);
    if (totalFrustration > 10) {
      recs.push(`🟡 Resolve ${totalFrustration} developer frustration markers (TODO/FIXME/HACK)`);
    }

    const smells = indicators.filter((i) => i.category === "code-smell");
    if (smells.length > 3) {
      recs.push(`🟠 Address ${smells.length} code smell categories to reduce complexity`);
    }

    const debt = indicators.filter((i) => i.category === "tech-debt");
    if (debt.length > 0) {
      recs.push(`🔵 Plan tech debt reduction: ${debt.map((d) => d.description).join(", ")}`);
    }

    if (recs.length === 0) {
      recs.push("✅ Codebase stress levels are healthy — no immediate action required");
    }

    return recs;
  }
}
