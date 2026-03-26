/**
 * @nexus/mcp — MCP server factories for the Nexus platform
 *
 * Three servers, one for each Nexus layer:
 *   - Perception (Architect): analyze, score, forecast, antiPatterns
 *   - Validation (Sentinel): validate, consensus, qualityGate
 *   - Reasoning (CTO Toolkit): routeSkills, executeGuidance
 *
 * Each server accepts a pluggable backend so users can provide
 * custom implementations or mock them for testing.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

export { createPerceptionServer } from "./perception-server.js";
export type { PerceptionBackend, ForecastResult, AntiPatternResult } from "./perception-server.js";

export { createValidationServer } from "./validation-server.js";
export type {
  ValidationBackend,
  ValidationConfig,
  ConsensusResult,
  ConsensusIssue,
  QualityGateConfig,
  QualityGateResult,
} from "./validation-server.js";

export { createReasoningServer } from "./reasoning-server.js";
export type { ReasoningBackend, SkillRouteResult } from "./reasoning-server.js";
