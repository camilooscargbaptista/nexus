/**
 * Architect Adapter — Transforms Architect output into Nexus types
 *
 * Wraps the existing @girardelli/architect package and translates
 * its AnalysisReport into NexusEvents and ArchitectureSnapshots.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type {
  ArchitectureSnapshot,
  ArchitectureScoreBreakdown,
  AntiPatternFinding,
  LayerInfo,
  DependencyInfo,
  Domain,
  Severity,
  NexusEventType,
  NexusLayer,
  TemporalData,
  ForecastData,
} from "@nexus/types";
import type { NexusEventBus } from "@nexus/events";

/**
 * Optional v4 temporal/forecast data from Architect analyzers.
 */
export interface ArchitectTemporalReport {
  overallTrend: string;
  overallTemporalScore: number;
  periodWeeks: number;
  totalCommits: number;
  totalAuthors: number;
  modules: Array<{
    module: string;
    staticScore: number;
    temporalScore: number;
    trend: string;
    projectedScore: number;
    riskLevel: string;
    velocity: { commitAcceleration: number; churnTrend: number };
    weeklyCommitRate?: number;
    busFactor?: number;
  }>;
  hotspots: Array<{
    path: string;
    commits: number;
    churnRate: number;
    busFactor: number;
  }>;
}

export interface ArchitectForecastReport {
  outlook: string;
  headline: string;
  preAntiPatterns: Array<{
    type: string;
    module: string;
    severity: string;
    weeksToThreshold: number;
    description: string;
    recommendation: string;
    confidence: number;
  }>;
  topRisks: string[];
  recommendations: string[];
  modules: Array<{
    module: string;
    currentHealth: string;
    forecast6Months: string;
    bottleneckProbability: number;
    riskFactors: string[];
    topAction: string;
  }>;
}

/**
 * Types mirroring Architect's AnalysisReport structure.
 * These map directly to the Architect v3.1 output format.
 */
export interface ArchitectAnalysisReport {
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
// ADAPTER
// ═══════════════════════════════════════════════════════════════

export class ArchitectAdapter {
  constructor(
    private eventBus: NexusEventBus,
    private architectPath?: string
  ) {}

  /**
   * Run Architect analysis and convert to Nexus snapshot.
   * If architectModule is provided, uses it directly.
   * Otherwise, dynamically imports from the architect package.
   */
  async analyze(
    projectPath: string,
    architectModule?: { analyze: (path: string) => Promise<ArchitectAnalysisReport> }
  ): Promise<ArchitectureSnapshot> {
    const startTime = Date.now();

    // Get the architect module
    const arch = architectModule ?? await this.loadArchitect();

    // Run analysis
    const report = await arch.analyze(projectPath);

    // Transform to Nexus types
    const snapshot = this.transformReport(report);

    // Emit events
    const correlationId = crypto.randomUUID();
    const metadata = {
      projectPath,
      projectName: snapshot.projectName,
      domain: snapshot.domain,
      duration: Date.now() - startTime,
    };

    await this.eventBus.publish(
      "architecture.analyzed" as NexusEventType,
      "perception" as NexusLayer,
      snapshot,
      metadata,
      correlationId
    );

    // Emit individual anti-pattern events
    for (const ap of snapshot.antiPatterns) {
      if (ap.severity === "critical" || ap.severity === "high") {
        await this.eventBus.publish(
          "anti_pattern.detected" as NexusEventType,
          "perception" as NexusLayer,
          ap,
          metadata,
          correlationId
        );
      }
    }

    // Emit score event
    await this.eventBus.publish(
      "score.calculated" as NexusEventType,
      "perception" as NexusLayer,
      snapshot.score,
      metadata,
      correlationId
    );

    return snapshot;
  }

  /**
   * Enrich an existing snapshot with temporal and forecast data from Architect v4.
   */
  enrichWithTemporal(
    snapshot: ArchitectureSnapshot,
    temporal?: ArchitectTemporalReport,
    forecast?: ArchitectForecastReport,
  ): ArchitectureSnapshot {
    const enriched = { ...snapshot };

    if (temporal) {
      enriched.temporal = this.transformTemporal(temporal);
    }
    if (forecast) {
      enriched.forecast = this.transformForecast(forecast);
    }

    return enriched;
  }

  private transformTemporal(raw: ArchitectTemporalReport): TemporalData {
    return {
      overallTrend: raw.overallTrend as TemporalData['overallTrend'],
      overallTemporalScore: raw.overallTemporalScore,
      periodWeeks: raw.periodWeeks,
      totalCommits: raw.totalCommits,
      totalAuthors: raw.totalAuthors,
      modules: raw.modules.map(m => ({
        module: m.module,
        staticScore: m.staticScore,
        temporalScore: m.temporalScore,
        trend: m.trend as 'improving' | 'stable' | 'degrading',
        projectedScore: m.projectedScore,
        riskLevel: m.riskLevel as 'low' | 'medium' | 'high' | 'critical',
        weeklyCommitRate: m.weeklyCommitRate ?? 0,
        churnTrend: m.velocity.churnTrend,
        busFactor: m.busFactor ?? 0,
      })),
      hotspots: raw.hotspots.map(h => ({
        path: h.path,
        commits: h.commits,
        churnRate: h.churnRate,
        busFactor: h.busFactor,
      })),
    };
  }

  private transformForecast(raw: ArchitectForecastReport): ForecastData {
    return {
      outlook: raw.outlook as ForecastData['outlook'],
      headline: raw.headline,
      preAntiPatterns: raw.preAntiPatterns.map(p => ({
        type: p.type,
        module: p.module,
        severity: p.severity as 'watch' | 'warning' | 'alert',
        weeksToThreshold: p.weeksToThreshold,
        description: p.description,
        recommendation: p.recommendation,
        confidence: p.confidence,
      })),
      topRisks: raw.topRisks,
      recommendations: raw.recommendations,
      moduleForecast: raw.modules.map(m => ({
        module: m.module,
        currentHealth: m.currentHealth as 'healthy' | 'at-risk' | 'degrading' | 'critical',
        forecast6Months: m.forecast6Months as 'stable' | 'declining' | 'breakdown',
        bottleneckProbability: m.bottleneckProbability,
        riskFactors: m.riskFactors,
        topAction: m.topAction,
      })),
    };
  }

  /**
   * Transform Architect's AnalysisReport into Nexus ArchitectureSnapshot.
   */
  private transformReport(report: ArchitectAnalysisReport): ArchitectureSnapshot {
    const score: ArchitectureScoreBreakdown = {
      overall: report.score.overall,
      modularity: report.score.breakdown.modularity,
      coupling: report.score.breakdown.coupling,
      cohesion: report.score.breakdown.cohesion,
      layering: report.score.breakdown.layering,
    };

    const layers: LayerInfo[] = report.layers.map((l) => ({
      name: l.name,
      type: this.mapLayerType(l.type),
      fileCount: l.files.length,
      files: l.files,
    }));

    const antiPatterns: AntiPatternFinding[] = report.antiPatterns.map((ap) => ({
      pattern: ap.name,
      severity: this.mapSeverity(ap.severity),
      location: ap.location,
      description: ap.description,
      affectedFiles: ap.files ?? [ap.location],
      suggestedAction: ap.suggestion,
    }));

    const dependencies: DependencyInfo[] = report.dependencies.map((d) => ({
      source: d.source,
      target: d.target,
      type: (d.type as DependencyInfo["type"]) ?? "import",
      weight: d.weight ?? 1,
    }));

    return {
      projectPath: report.projectInfo.path,
      projectName: report.projectInfo.name,
      timestamp: new Date().toISOString(),
      score,
      layers,
      antiPatterns,
      dependencies,
      frameworks: report.projectInfo.frameworks ?? [],
      domain: this.mapDomain(report.projectInfo.domain),
      fileCount: report.projectInfo.files,
      lineCount: report.projectInfo.lines ?? 0,
    };
  }

  private mapLayerType(type: string): LayerInfo["type"] {
    const map: Record<string, LayerInfo["type"]> = {
      api: "api", controller: "api", route: "api",
      service: "service", usecase: "service", application: "service",
      data: "data", repository: "data", model: "data", entity: "data",
      ui: "ui", view: "ui", component: "ui", page: "ui",
      infrastructure: "infrastructure", infra: "infrastructure", config: "infrastructure",
      shared: "shared", common: "shared", util: "shared", lib: "shared",
    };
    return map[type.toLowerCase()] ?? "unknown";
  }

  private mapSeverity(severity: string): Severity {
    const map: Record<string, Severity> = {
      critical: "critical" as Severity,
      high: "high" as Severity,
      medium: "medium" as Severity,
      low: "low" as Severity,
      info: "info" as Severity,
    };
    return map[severity.toLowerCase()] ?? ("medium" as Severity);
  }

  private mapDomain(domain?: string): Domain {
    if (!domain) return "generic" as Domain;
    const map: Record<string, Domain> = {
      fintech: "fintech" as Domain,
      finance: "fintech" as Domain,
      healthtech: "healthtech" as Domain,
      health: "healthtech" as Domain,
      ecommerce: "ecommerce" as Domain,
      commerce: "ecommerce" as Domain,
      edtech: "edtech" as Domain,
      education: "edtech" as Domain,
      saas: "saas" as Domain,
      devtools: "devtools" as Domain,
    };
    return map[domain.toLowerCase()] ?? ("generic" as Domain);
  }

  private async loadArchitect(): Promise<{ analyze: (path: string) => Promise<ArchitectAnalysisReport> }> {
    try {
      const mod = await import(this.architectPath ?? "@girardelli/architect");
      const rawArchitect = mod.architect ?? mod.default;
      // Use bridge to transform raw Architect output → ArchitectAnalysisReport
      const { createArchitectBridge } = await import("./architect-bridge.js");
      return createArchitectBridge(rawArchitect);
    } catch (err) {
      throw new Error(
        `Could not load @girardelli/architect: ${err instanceof Error ? err.message : String(err)}. ` +
        `Install it with: npm install @girardelli/architect`
      );
    }
  }
}
