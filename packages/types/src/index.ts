/**
 * @camilooscargbaptista/nexus-types — Unified type system for the Nexus platform
 *
 * These types form the contract between all Nexus layers:
 *   Architect (Perception) → CTO Toolkit (Reasoning) → Sentinel (Validation) → Autonomy
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// CORE ENUMS
// ═══════════════════════════════════════════════════════════════

export enum NexusLayer {
  PERCEPTION = "perception",
  REASONING = "reasoning",
  VALIDATION = "validation",
  AUTONOMY = "autonomy",
}

export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

export enum Domain {
  FINTECH = "fintech",
  HEALTHTECH = "healthtech",
  ECOMMERCE = "ecommerce",
  EDTECH = "edtech",
  SAAS = "saas",
  DEVTOOLS = "devtools",
  GENERIC = "generic",
}

export enum ConfidenceLevel {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  UNCERTAIN = "uncertain",
}

// ═══════════════════════════════════════════════════════════════
// NEXUS EVENT SYSTEM — The nervous system
// ═══════════════════════════════════════════════════════════════

export enum NexusEventType {
  // Perception events (Architect)
  ARCHITECTURE_ANALYZED = "architecture.analyzed",
  ANTI_PATTERN_DETECTED = "anti_pattern.detected",
  SCORE_CALCULATED = "score.calculated",
  LAYER_MAPPED = "layer.mapped",
  DRIFT_DETECTED = "drift.detected",

  // Reasoning events (CTO Toolkit)
  GUIDANCE_GENERATED = "guidance.generated",
  SKILL_TRIGGERED = "skill.triggered",
  DECISION_PROPOSED = "decision.proposed",
  REVIEW_COMPLETED = "review.completed",

  // Validation events (Sentinel)
  VALIDATION_STARTED = "validation.started",
  VALIDATION_COMPLETED = "validation.completed",
  QUALITY_GATE_PASSED = "quality_gate.passed",
  QUALITY_GATE_FAILED = "quality_gate.failed",
  ISSUE_FOUND = "issue.found",

  // Autonomy events
  REMEDIATION_PROPOSED = "remediation.proposed",
  REMEDIATION_APPLIED = "remediation.applied",
  EVOLUTION_PROPOSED = "evolution.proposed",
  FEEDBACK_RECORDED = "feedback.recorded",

  // Cross-cutting
  PIPELINE_STARTED = "pipeline.started",
  PIPELINE_COMPLETED = "pipeline.completed",
  ERROR_OCCURRED = "error.occurred",
}

export interface NexusEvent<T = unknown> {
  id: string;
  type: NexusEventType;
  source: NexusLayer;
  timestamp: string;
  correlationId: string; // Links events in the same pipeline run
  payload: T;
  metadata: NexusEventMetadata;
}

export interface NexusEventMetadata {
  projectPath: string;
  projectName?: string;
  domain?: Domain;
  triggeredBy?: string; // ID of the event that triggered this one
  duration?: number; // milliseconds
  confidence?: ConfidenceLevel;
}

// ═══════════════════════════════════════════════════════════════
// PERCEPTION LAYER TYPES (Architect)
// ═══════════════════════════════════════════════════════════════

export interface ArchitectureSnapshot {
  projectPath: string;
  projectName: string;
  timestamp: string;
  score: ArchitectureScoreBreakdown;
  layers: LayerInfo[];
  antiPatterns: AntiPatternFinding[];
  dependencies: DependencyInfo[];
  frameworks: string[];
  domain: Domain;
  fileCount: number;
  lineCount: number;

  // ── v4.0: Temporal & Predictive ──
  temporal?: TemporalData;
  forecast?: ForecastData;
}

// ── v4.0 Temporal Types ──

export type ArchTrend = "improving" | "stable" | "degrading";

export interface TemporalData {
  overallTrend: ArchTrend;
  overallTemporalScore: number;
  periodWeeks: number;
  totalCommits: number;
  totalAuthors: number;
  modules: ModuleTemporalScore[];
  hotspots: HotspotInfo[];
}

export interface ModuleTemporalScore {
  module: string;
  staticScore: number;
  temporalScore: number;
  trend: ArchTrend;
  projectedScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  weeklyCommitRate: number;
  churnTrend: number;
  busFactor: number;
}

export interface HotspotInfo {
  path: string;
  commits: number;
  churnRate: number;
  busFactor: number;
}

// ── v4.0 Forecast Types ──

export interface ForecastData {
  outlook: "sunny" | "cloudy" | "stormy";
  headline: string;
  preAntiPatterns: PreAntiPatternInfo[];
  topRisks: string[];
  recommendations: string[];
  moduleForecast: ModuleForecastInfo[];
}

export interface PreAntiPatternInfo {
  type: string;
  module: string;
  severity: "watch" | "warning" | "alert";
  weeksToThreshold: number;
  description: string;
  recommendation: string;
  confidence: number;
}

export interface ModuleForecastInfo {
  module: string;
  currentHealth: "healthy" | "at-risk" | "degrading" | "critical";
  forecast6Months: "stable" | "declining" | "breakdown";
  bottleneckProbability: number;
  riskFactors: string[];
  topAction: string;
}

export interface ArchitectureScoreBreakdown {
  overall: number; // 0-100
  modularity: number;
  coupling: number;
  cohesion: number;
  layering: number;
}

export interface LayerInfo {
  name: string;
  type: "api" | "service" | "data" | "ui" | "infrastructure" | "shared" | "unknown";
  fileCount: number;
  files: string[];
}

export interface AntiPatternFinding {
  pattern: string;
  severity: Severity;
  location: string;
  description: string;
  affectedFiles: string[];
  suggestedAction?: string;
  estimatedImpact?: number; // Score improvement if fixed (0-100)
}

export interface DependencyInfo {
  source: string;
  target: string;
  type: "import" | "extends" | "implements" | "calls" | "injects";
  weight: number;
}

// ═══════════════════════════════════════════════════════════════
// REASONING LAYER TYPES (CTO Toolkit)
// ═══════════════════════════════════════════════════════════════

export interface GuidanceResult {
  skillName: string;
  category: SkillCategory;
  findings: GuidanceFinding[];
  recommendations: Recommendation[];
  estimatedEffort: EffortEstimate;
  confidence: ConfidenceLevel;
}

export enum SkillCategory {
  CODE_REVIEW = "code-review",
  ARCHITECTURE = "architecture",
  SECURITY = "security",
  DEVOPS = "devops",
  DATA = "data",
  QUALITY = "quality",
  DATABASE = "database",
  PERFORMANCE = "performance",
  PROCESS = "process",
  OPERATIONAL = "operational",
}

export interface GuidanceFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  skillSource: string; // Which of the 54 skills generated this
  referenceDoc?: string; // Path to reference file
  affectedFiles: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: Severity;
  effort: EffortEstimate;
  impact: ImpactEstimate;
  linkedFindings: string[]; // IDs of findings this addresses
  codeExample?: string;
}

export interface EffortEstimate {
  hours: number;
  size: "XS" | "S" | "M" | "L" | "XL";
  complexity: "low" | "medium" | "high";
}

export interface ImpactEstimate {
  scoreImprovement: number; // Predicted score change (0-100)
  riskReduction: Severity;
  businessImpact: string;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION LAYER TYPES (Sentinel)
// ═══════════════════════════════════════════════════════════════

export interface ValidationSnapshot {
  projectPath: string;
  timestamp: string;
  success: boolean;
  overallScore: number; // 0-100
  validators: ValidatorSnapshot[];
  issueCount: IssueCount;
  duration: number; // milliseconds
}

export interface ValidatorSnapshot {
  name: string;
  passed: boolean;
  score: number;
  threshold: number;
  issueCount: number;
  topIssues: ValidationIssueSummary[];
}

export interface ValidationIssueSummary {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface IssueCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════
// AUTONOMY LAYER TYPES
// ═══════════════════════════════════════════════════════════════

export interface RemediationProposal {
  id: string;
  trigger: NexusEventType;
  triggerEventId: string;
  severity: Severity;
  description: string;
  changes: ProposedChange[];
  confidence: ConfidenceLevel;
  estimatedImpact: ImpactEstimate;
  requiresApproval: boolean;
}

export interface ProposedChange {
  file: string;
  type: "create" | "modify" | "delete" | "move";
  description: string;
  diff?: string;
}

export interface EvolutionProposal {
  id: string;
  title: string;
  quarter: string;
  summary: string;
  rationale: string;
  changes: ProposedChange[];
  predictedScoreAfter: ArchitectureScoreBreakdown;
  migrationPhases: MigrationPhase[];
  risks: Risk[];
}

export interface MigrationPhase {
  phase: number;
  title: string;
  description: string;
  effort: EffortEstimate;
  dependencies: string[];
}

export interface Risk {
  description: string;
  probability: "low" | "medium" | "high";
  impact: Severity;
  mitigation: string;
}

// ═══════════════════════════════════════════════════════════════
// NEXUS PIPELINE — The unified result
// ═══════════════════════════════════════════════════════════════

export interface NexusPipelineResult {
  id: string;
  projectPath: string;
  projectName: string;
  timestamp: string;
  duration: number;
  domain: Domain;

  // Layer results
  perception: ArchitectureSnapshot;
  reasoning: GuidanceResult[];
  validation: ValidationSnapshot;

  // Cross-layer insights
  insights: NexusInsight[];
  healthScore: number; // Composite 0-100
  trend: "improving" | "stable" | "degrading";

  // Autonomy proposals (if enabled)
  remediations?: RemediationProposal[];
  evolutionProposal?: EvolutionProposal;
}

export interface NexusInsight {
  id: string;
  type: "correlation" | "prediction" | "recommendation" | "warning";
  title: string;
  description: string;
  sources: NexusLayer[];
  severity: Severity;
  confidence: ConfidenceLevel;
  actionable: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface NexusConfig {
  // Project
  projectPath: string;
  projectName?: string;

  // Perception (Architect)
  perception: {
    enabled: boolean;
    scoreThreshold: number;
    detectAntiPatterns: boolean;
    trackDrift: boolean;
  };

  // Reasoning (CTO Toolkit)
  reasoning: {
    enabled: boolean;
    skills: string[]; // Which skills to activate, or ["*"] for all
    autoRoute: boolean; // Auto-detect which skills to apply
  };

  // Validation (Sentinel)
  validation: {
    enabled: boolean;
    securityLevel: "strict" | "moderate" | "permissive";
    testingThreshold: number;
    performanceTarget: "optimal" | "good" | "acceptable";
    maintainabilityScore: number;
  };

  // Autonomy
  autonomy: {
    enabled: boolean;
    autoRemediate: boolean;
    requireApproval: boolean;
    maxSeverityAutoFix: Severity;
  };

  // General
  reporters: ("json" | "markdown" | "html" | "console")[];
  verbose: boolean;
}

export const DEFAULT_CONFIG: NexusConfig = {
  projectPath: ".",
  perception: {
    enabled: true,
    scoreThreshold: 60,
    detectAntiPatterns: true,
    trackDrift: false,
  },
  reasoning: {
    enabled: true,
    skills: ["*"],
    autoRoute: true,
  },
  validation: {
    enabled: true,
    securityLevel: "moderate",
    testingThreshold: 70,
    performanceTarget: "good",
    maintainabilityScore: 60,
  },
  autonomy: {
    enabled: false,
    autoRemediate: false,
    requireApproval: true,
    maxSeverityAutoFix: Severity.MEDIUM,
  },
  reporters: ["console"],
  verbose: false,
};
