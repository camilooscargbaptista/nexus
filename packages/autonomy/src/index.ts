/**
 * @nexus/autonomy — Self-healing, debt prevention, architecture evolution
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

export { RemediationEngine } from "./remediation.js";
export type {
  RemediationConfig,
  RemediationPlan,
  RemediationResult,
  RemediationReport,
  FixStrategy,
  FixStep,
  FilePatch,
  PatchHunk,
  VerificationResult,
  FileSystemAdapter,
  ValidatorAdapter,
  FixGenerator,
  SubAgentVerifier,
} from "./remediation.js";

export { DebtPrevention, HeuristicEstimator } from "./debt-prevention.js";
export type {
  DebtPreventionConfig,
  ScoreDimension,
  PRChangeSet,
  PRFileChange,
  CodebaseTrajectory,
  DimensionScores,
  ApproachingPattern,
  DebtVerdict,
  PatternAcceleration,
  ScoreImpactEstimator,
} from "./debt-prevention.js";

export { AEPGenerator } from "./aep-generator.js";
export type {
  AEPConfig,
  AEPInput,
  AEPReport,
  EvolutionProposal,
  HealthOverview,
  SimulatedImpact,
  RoadmapItem,
  RiskAssessment,
  ReportMetrics,
} from "./aep-generator.js";
