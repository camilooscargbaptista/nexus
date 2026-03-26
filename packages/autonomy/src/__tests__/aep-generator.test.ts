/**
 * Tests for Architecture Evolution Proposals
 */
import { AEPGenerator } from '../aep-generator';
import type { AEPInput, ScoreSummary } from '../aep-generator';

// ─── Helpers ────────────────────────────────────────────────

function makeScores(overrides?: Partial<ScoreSummary>): ScoreSummary {
  return {
    overall: 72,
    security: 80,
    testing: 75,
    performance: 70,
    maintainability: 65,
    architecture: 70,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<AEPInput>): AEPInput {
  return {
    currentScores: makeScores(),
    previousScores: makeScores({ overall: 68 }),
    preAntiPatterns: [],
    driftViolations: [],
    businessGateFailures: [],
    riskTrends: [],
    moduleHealth: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('AEPGenerator', () => {
  const generator = new AEPGenerator({ period: 'Q1 2026', projectName: 'test-project' });

  describe('generate — health overview', () => {
    it('should detect improving trend', () => {
      const report = generator.generate(makeInput({
        currentScores: makeScores({ overall: 80 }),
        previousScores: makeScores({ overall: 70 }),
      }));

      expect(report.healthOverview.scoreTrend).toBe('improving');
      expect(report.healthOverview.scoreDelta).toBe(10);
    });

    it('should detect degrading trend', () => {
      const report = generator.generate(makeInput({
        currentScores: makeScores({ overall: 60 }),
        previousScores: makeScores({ overall: 75 }),
      }));

      expect(report.healthOverview.scoreTrend).toBe('degrading');
    });

    it('should detect stable trend', () => {
      const report = generator.generate(makeInput({
        currentScores: makeScores({ overall: 70 }),
        previousScores: makeScores({ overall: 71 }),
      }));

      expect(report.healthOverview.scoreTrend).toBe('stable');
    });

    it('should list top strengths and concerns', () => {
      const report = generator.generate(makeInput());
      expect(report.healthOverview.topStrengths.length).toBe(2);
      expect(report.healthOverview.topConcerns.length).toBe(2);
    });
  });

  describe('generate — proposals from pre-anti-patterns', () => {
    it('should generate proposals for imminent anti-patterns', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'god-class', module: 'src/app.ts', severity: 75, sprintsUntilThreshold: 1, trend: 'accelerating' },
          { type: 'shotgun-surgery', module: 'src/utils', severity: 50, sprintsUntilThreshold: 2, trend: 'stable' },
        ],
      }));

      expect(report.proposals.length).toBe(2);
      expect(report.proposals[0].priority).toBe('critical'); // 1 sprint
      expect(report.proposals[1].priority).toBe('high'); // 2 sprints
    });

    it('should skip low-confidence patterns', () => {
      const gen = new AEPGenerator({ period: 'Q1', projectName: 'test', minConfidence: 0.8 });
      const report = gen.generate(makeInput({
        preAntiPatterns: [
          { type: 'coupling-magnet', module: 'src/lib', severity: 30, sprintsUntilThreshold: 2, trend: 'decelerating' },
        ],
      }));

      expect(report.proposals.length).toBe(0); // decelerating = 0.5 confidence < 0.8
    });
  });

  describe('generate — proposals from drift violations', () => {
    it('should create drift remediation proposal', () => {
      const report = generator.generate(makeInput({
        driftViolations: [
          { adrId: 'ADR-001', constraintType: 'technology-ban', description: 'Moment.js still in use', severity: 'high' },
          { adrId: 'ADR-002', constraintType: 'layer-rule', description: 'Data layer imports presentation', severity: 'critical' },
        ],
      }));

      const driftProposal = report.proposals.find(p => p.title.includes('drift'));
      expect(driftProposal).toBeDefined();
      expect(driftProposal!.simulatedImpact.driftResolved.length).toBe(2);
    });
  });

  describe('generate — proposals from business gate failures', () => {
    it('should create proposals for large gaps', () => {
      const report = generator.generate(makeInput({
        businessGateFailures: [
          { dimension: 'security', score: 50, threshold: 85, gap: 35, businessMetric: 'incident rate' },
        ],
      }));

      const secProposal = report.proposals.find(p => p.category === 'security');
      expect(secProposal).toBeDefined();
      expect(secProposal!.priority).toBe('critical'); // gap >= 25
    });

    it('should skip small gaps', () => {
      const report = generator.generate(makeInput({
        businessGateFailures: [
          { dimension: 'documentation', score: 65, threshold: 70, gap: 5, businessMetric: 'onboarding time' },
        ],
      }));

      // gap < 10, no proposal
      const docProposal = report.proposals.find(p => p.title.includes('documentation'));
      expect(docProposal).toBeUndefined();
    });
  });

  describe('generate — proposals from degrading modules', () => {
    it('should flag degrading low-score modules', () => {
      const report = generator.generate(makeInput({
        moduleHealth: [
          { module: 'src/legacy', score: 35, churnRate: 0.8, busFactor: 1, couplingScore: 90, trend: 'degrading' },
          { module: 'src/core', score: 85, churnRate: 0.2, busFactor: 3, couplingScore: 30, trend: 'stable' },
        ],
      }));

      const legacyProposal = report.proposals.find(p => p.affectedModules.includes('src/legacy'));
      expect(legacyProposal).toBeDefined();
      expect(legacyProposal!.category).toBe('consolidation'); // bus factor ≤ 1
    });
  });

  describe('generate — roadmap', () => {
    it('should prioritize critical proposals to immediate', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'god-class', module: 'app', severity: 90, sprintsUntilThreshold: 0.5, trend: 'accelerating' },
        ],
        businessGateFailures: [
          { dimension: 'testing', score: 40, threshold: 70, gap: 30, businessMetric: 'bug escape rate' },
        ],
      }));

      expect(report.prioritizedRoadmap.length).toBeGreaterThan(0);
      expect(report.prioritizedRoadmap[0].quarter).toContain('Immediate');
    });

    it('should create multi-quarter roadmap', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'god-class', module: 'app', severity: 90, sprintsUntilThreshold: 0.5, trend: 'accelerating' },
        ],
        moduleHealth: [
          { module: 'src/old', score: 45, churnRate: 0.5, busFactor: 2, couplingScore: 50, trend: 'degrading' },
        ],
      }));

      expect(report.prioritizedRoadmap.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generate — risk assessment', () => {
    it('should flag imminent anti-pattern breach', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'god-class', module: 'app', severity: 95, sprintsUntilThreshold: 0.5, trend: 'accelerating' },
        ],
      }));

      const imminentRisk = report.risks.find(r => r.risk.includes('Imminent'));
      expect(imminentRisk).toBeDefined();
      expect(imminentRisk!.probability).toBe('high');
    });

    it('should flag high risk budget utilization', () => {
      const report = generator.generate(makeInput({
        riskTrends: [
          { sprintId: 's1', consumed: 90, budget: 100, utilizationPercent: 90 },
          { sprintId: 's2', consumed: 85, budget: 100, utilizationPercent: 85 },
        ],
      }));

      const budgetRisk = report.risks.find(r => r.risk.includes('budget'));
      expect(budgetRisk).toBeDefined();
    });

    it('should flag bus factor risk', () => {
      const report = generator.generate(makeInput({
        moduleHealth: [
          { module: 'src/critical', score: 70, churnRate: 0.3, busFactor: 1, couplingScore: 40, trend: 'stable' },
        ],
      }));

      const busRisk = report.risks.find(r => r.risk.includes('bus factor'));
      expect(busRisk).toBeDefined();
    });
  });

  describe('generate — executive summary', () => {
    it('should mention score and trend', () => {
      const report = generator.generate(makeInput());
      expect(report.executiveSummary).toContain('72/100');
      expect(report.executiveSummary).toContain('improving');
    });

    it('should mention critical proposals', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'god-class', module: 'app', severity: 90, sprintsUntilThreshold: 0.5, trend: 'accelerating' },
        ],
      }));
      expect(report.executiveSummary).toContain('critical');
    });

    it('should include projected total impact', () => {
      const report = generator.generate(makeInput({
        businessGateFailures: [
          { dimension: 'security', score: 50, threshold: 85, gap: 35, businessMetric: 'incident rate' },
        ],
      }));
      expect(report.executiveSummary).toContain('improve overall score');
    });
  });

  describe('generate — metrics', () => {
    it('should count analyzed items correctly', () => {
      const report = generator.generate(makeInput({
        preAntiPatterns: [
          { type: 'a', module: 'm', severity: 50, sprintsUntilThreshold: 2, trend: 'stable' },
        ],
        driftViolations: [
          { adrId: 'A1', constraintType: 'ban', description: 'd', severity: 'high' },
          { adrId: 'A2', constraintType: 'ban', description: 'd', severity: 'low' },
        ],
        businessGateFailures: [
          { dimension: 'sec', score: 50, threshold: 80, gap: 30, businessMetric: 'm' },
        ],
        moduleHealth: [
          { module: 'a', score: 70, churnRate: 0.3, busFactor: 2, couplingScore: 40, trend: 'stable' },
          { module: 'b', score: 60, churnRate: 0.5, busFactor: 1, couplingScore: 60, trend: 'degrading' },
        ],
      }));

      expect(report.metrics.modulesAnalyzed).toBe(2);
      expect(report.metrics.antiPatternsDetected).toBe(1);
      expect(report.metrics.driftViolations).toBe(2);
      expect(report.metrics.businessGateFailures).toBe(1);
    });
  });

  describe('maxProposals config', () => {
    it('should cap proposals at maxProposals', () => {
      const gen = new AEPGenerator({ period: 'Q1', projectName: 'test', maxProposals: 2 });
      const report = gen.generate(makeInput({
        preAntiPatterns: Array.from({ length: 5 }, (_, i) => ({
          type: `pattern-${i}`,
          module: `mod-${i}`,
          severity: 60,
          sprintsUntilThreshold: 2,
          trend: 'accelerating' as const,
        })),
      }));

      expect(report.proposals.length).toBe(2);
    });
  });
});
