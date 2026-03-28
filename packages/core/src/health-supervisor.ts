/**
 * @camilooscargbaptista/nexus-core — Health Supervisor
 *
 * Agrega sinais de saúde do codebase: TODO/FIXME count,
 * complexity trends, score velocity, test coverage deltas.
 *
 * "EmotionalSupervisor do codebase" — inspirado no SmartCollect.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface HealthSignal {
  name: string;
  value: number;
  trend: "improving" | "stable" | "degrading";
  severity: "healthy" | "warning" | "critical";
  description: string;
}

export interface HealthSnapshot {
  timestamp: number;
  overallScore: number;
  overallStatus: "healthy" | "warning" | "critical";
  signals: HealthSignal[];
  /** Sinais que pioraram desde último snapshot */
  degradations: HealthSignal[];
  /** Sinais que melhoraram desde último snapshot */
  improvements: HealthSignal[];
}

export interface HealthThresholds {
  /** Max TODO/FIXMEs antes de warning — default 20 */
  maxTodos: number;
  /** Max TODO/FIXMEs antes de critical — default 50 */
  criticalTodos: number;
  /** Min architecture score — default 60 */
  minArchScore: number;
  /** Max files > 500 lines — default 5 */
  maxLargeFiles: number;
  /** Min test coverage % — default 70 */
  minTestCoverage: number;
}

export interface CodebaseMetrics {
  todoCount: number;
  fixmeCount: number;
  totalFiles: number;
  largeFiles: number;
  avgComplexity: number;
  testCoverage: number;
  archScore: number;
  circularDeps: number;
  staleDependencies: number;
  deadCodePercent: number;
}

// ═══════════════════════════════════════════════════════════════
// HEALTH SUPERVISOR
// ═══════════════════════════════════════════════════════════════

/**
 * Monitora a saúde do codebase ao longo do tempo.
 *
 * Agrega métricas, detecta tendências (improving/stable/degrading),
 * e emite snapshots de saúde com severidade.
 *
 * @example
 * ```ts
 * const supervisor = new HealthSupervisor();
 * const snapshot = supervisor.analyze(currentMetrics);
 * // snapshot.overallStatus === "warning"
 * // snapshot.degradations === [{ name: "todo-count", trend: "degrading" }]
 * ```
 */
export class HealthSupervisor {
  private history: HealthSnapshot[] = [];
  private thresholds: HealthThresholds;

  constructor(thresholds?: Partial<HealthThresholds>) {
    this.thresholds = {
      maxTodos: thresholds?.maxTodos ?? 20,
      criticalTodos: thresholds?.criticalTodos ?? 50,
      minArchScore: thresholds?.minArchScore ?? 60,
      maxLargeFiles: thresholds?.maxLargeFiles ?? 5,
      minTestCoverage: thresholds?.minTestCoverage ?? 70,
    };
  }

  /**
   * Analisa métricas atuais e gera um snapshot de saúde.
   */
  analyze(metrics: CodebaseMetrics): HealthSnapshot {
    const signals = this.computeSignals(metrics);
    const previous = this.history[this.history.length - 1];

    // Compute trends by comparing with previous snapshot
    if (previous) {
      for (const signal of signals) {
        const prevSignal = previous.signals.find((s) => s.name === signal.name);
        if (prevSignal) {
          if (signal.value < prevSignal.value && signal.name !== "arch-score" && signal.name !== "test-coverage") {
            signal.trend = "improving";
          } else if (signal.value > prevSignal.value && signal.name !== "arch-score" && signal.name !== "test-coverage") {
            signal.trend = "degrading";
          } else if (signal.name === "arch-score" || signal.name === "test-coverage") {
            signal.trend = signal.value > prevSignal.value ? "improving"
              : signal.value < prevSignal.value ? "degrading" : "stable";
          } else {
            signal.trend = "stable";
          }
        }
      }
    }

    const degradations = signals.filter((s) => s.trend === "degrading");
    const improvements = signals.filter((s) => s.trend === "improving");

    const criticalCount = signals.filter((s) => s.severity === "critical").length;
    const warningCount = signals.filter((s) => s.severity === "warning").length;

    const overallStatus: HealthSnapshot["overallStatus"] =
      criticalCount > 0 ? "critical" : warningCount >= 2 ? "warning" : "healthy";

    const overallScore = Math.round(
      signals.reduce((sum, s) => {
        const weight = s.severity === "critical" ? 0 : s.severity === "warning" ? 0.5 : 1;
        return sum + weight;
      }, 0) / signals.length * 100,
    );

    const snapshot: HealthSnapshot = {
      timestamp: Date.now(),
      overallScore,
      overallStatus,
      signals,
      degradations,
      improvements,
    };

    this.history.push(snapshot);

    return snapshot;
  }

  /**
   * Retorna tendência geral do codebase entre snapshots.
   */
  getVelocity(): "improving" | "stable" | "degrading" | "unknown" {
    if (this.history.length < 2) return "unknown";

    const recent = this.history[this.history.length - 1]!;
    const previous = this.history[this.history.length - 2]!;

    const delta = recent.overallScore - previous.overallScore;
    if (delta > 5) return "improving";
    if (delta < -5) return "degrading";
    return "stable";
  }

  /** Número de snapshots no histórico */
  get snapshotCount(): number {
    return this.history.length;
  }

  /** Último snapshot */
  get lastSnapshot(): HealthSnapshot | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Computa sinais de saúde a partir das métricas.
   */
  private computeSignals(metrics: CodebaseMetrics): HealthSignal[] {
    const signals: HealthSignal[] = [];

    // TODO/FIXME count
    const todoTotal = metrics.todoCount + metrics.fixmeCount;
    signals.push({
      name: "todo-count",
      value: todoTotal,
      trend: "stable",
      severity: todoTotal > this.thresholds.criticalTodos ? "critical"
        : todoTotal > this.thresholds.maxTodos ? "warning" : "healthy",
      description: `${todoTotal} TODO/FIXME markers (${metrics.todoCount} TODO, ${metrics.fixmeCount} FIXME)`,
    });

    // Architecture score
    signals.push({
      name: "arch-score",
      value: metrics.archScore,
      trend: "stable",
      severity: metrics.archScore < this.thresholds.minArchScore ? "critical"
        : metrics.archScore < this.thresholds.minArchScore + 10 ? "warning" : "healthy",
      description: `Architecture score: ${metrics.archScore}/100`,
    });

    // Large files
    signals.push({
      name: "large-files",
      value: metrics.largeFiles,
      trend: "stable",
      severity: metrics.largeFiles > this.thresholds.maxLargeFiles * 2 ? "critical"
        : metrics.largeFiles > this.thresholds.maxLargeFiles ? "warning" : "healthy",
      description: `${metrics.largeFiles} files exceeding 500 lines`,
    });

    // Test coverage
    signals.push({
      name: "test-coverage",
      value: metrics.testCoverage,
      trend: "stable",
      severity: metrics.testCoverage < this.thresholds.minTestCoverage - 20 ? "critical"
        : metrics.testCoverage < this.thresholds.minTestCoverage ? "warning" : "healthy",
      description: `Test coverage: ${metrics.testCoverage}%`,
    });

    // Circular dependencies
    signals.push({
      name: "circular-deps",
      value: metrics.circularDeps,
      trend: "stable",
      severity: metrics.circularDeps > 3 ? "critical"
        : metrics.circularDeps > 0 ? "warning" : "healthy",
      description: `${metrics.circularDeps} circular dependencies detected`,
    });

    // Stale dependencies
    signals.push({
      name: "stale-deps",
      value: metrics.staleDependencies,
      trend: "stable",
      severity: metrics.staleDependencies > 10 ? "critical"
        : metrics.staleDependencies > 5 ? "warning" : "healthy",
      description: `${metrics.staleDependencies} stale/outdated dependencies`,
    });

    // Dead code
    signals.push({
      name: "dead-code",
      value: metrics.deadCodePercent,
      trend: "stable",
      severity: metrics.deadCodePercent > 20 ? "critical"
        : metrics.deadCodePercent > 10 ? "warning" : "healthy",
      description: `${metrics.deadCodePercent}% dead/unreachable code`,
    });

    // Average complexity
    signals.push({
      name: "avg-complexity",
      value: metrics.avgComplexity,
      trend: "stable",
      severity: metrics.avgComplexity > 15 ? "critical"
        : metrics.avgComplexity > 10 ? "warning" : "healthy",
      description: `Average cyclomatic complexity: ${metrics.avgComplexity}`,
    });

    return signals;
  }
}
