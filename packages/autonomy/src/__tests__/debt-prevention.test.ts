/**
 * Tests for Proactive Debt Prevention
 */
import { DebtPrevention, HeuristicEstimator } from '../debt-prevention';
import type { PRChangeSet, CodebaseTrajectory, DimensionScores } from '../debt-prevention';

// ─── Helpers ────────────────────────────────────────────────

function makeScores(overrides?: Partial<DimensionScores>): DimensionScores {
  return {
    complexity: 75,
    coupling: 80,
    cohesion: 70,
    testCoverage: 85,
    security: 80,
    documentation: 65,
    ...overrides,
  };
}

function makeTrajectory(overrides?: Partial<CodebaseTrajectory>): CodebaseTrajectory {
  return {
    current: makeScores(),
    history: [],
    approachingAntiPatterns: [],
    ...overrides,
  };
}

function makePR(overrides?: Partial<PRChangeSet>): PRChangeSet {
  return {
    prId: 'PR-123',
    title: 'Add user authentication',
    author: 'dev@example.com',
    filesChanged: [
      { path: 'src/auth.ts', changeType: 'added', linesAdded: 200, linesRemoved: 0 },
      { path: 'src/middleware.ts', changeType: 'modified', linesAdded: 50, linesRemoved: 10 },
    ],
    linesAdded: 250,
    linesRemoved: 10,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('HeuristicEstimator', () => {
  const estimator = new HeuristicEstimator();

  describe('estimatePostMerge', () => {
    it('should degrade complexity for large additions', async () => {
      const scores = makeScores();
      const pr = makePR({ linesAdded: 500, linesRemoved: 10 });

      const projected = await estimator.estimatePostMerge(scores, pr);
      expect(projected.complexity).toBeLessThan(scores.complexity);
    });

    it('should improve complexity for large deletions', async () => {
      const scores = makeScores();
      const pr = makePR({ linesAdded: 10, linesRemoved: 200 });

      const projected = await estimator.estimatePostMerge(scores, pr);
      expect(projected.complexity).toBeGreaterThan(scores.complexity);
    });

    it('should degrade testCoverage when source changes lack tests', async () => {
      const scores = makeScores();
      const pr = makePR({
        filesChanged: [
          { path: 'src/service.ts', changeType: 'modified', linesAdded: 50, linesRemoved: 0 },
          { path: 'src/repo.ts', changeType: 'modified', linesAdded: 50, linesRemoved: 0 },
        ],
      });

      const projected = await estimator.estimatePostMerge(scores, pr);
      expect(projected.testCoverage).toBeLessThan(scores.testCoverage);
    });

    it('should maintain testCoverage when tests are proportional', async () => {
      const scores = makeScores();
      const pr = makePR({
        filesChanged: [
          { path: 'src/service.ts', changeType: 'modified', linesAdded: 50, linesRemoved: 0 },
          { path: 'src/service.test.ts', changeType: 'modified', linesAdded: 100, linesRemoved: 0 },
        ],
      });

      const projected = await estimator.estimatePostMerge(scores, pr);
      expect(projected.testCoverage).toBeGreaterThanOrEqual(scores.testCoverage);
    });

    it('should degrade coupling for PRs touching many files', async () => {
      const scores = makeScores();
      const files = Array.from({ length: 20 }, (_, i) => ({
        path: `src/file-${i}.ts`,
        changeType: 'modified' as const,
        linesAdded: 10,
        linesRemoved: 5,
      }));

      const projected = await estimator.estimatePostMerge(scores, makePR({ filesChanged: files }));
      expect(projected.coupling).toBeLessThan(scores.coupling);
    });

    it('should flag security degradation for sensitive files without tests', async () => {
      const scores = makeScores();
      const pr = makePR({
        filesChanged: [
          { path: 'src/auth/password-handler.ts', changeType: 'modified', linesAdded: 30, linesRemoved: 5 },
        ],
      });

      const projected = await estimator.estimatePostMerge(scores, pr);
      expect(projected.security).toBeLessThan(scores.security);
    });
  });
});

describe('DebtPrevention', () => {
  const estimator = new HeuristicEstimator();

  describe('analyze — merge decision', () => {
    it('should return "merge" for clean PRs', async () => {
      const dp = new DebtPrevention(estimator);
      const verdict = await dp.analyze(
        makePR({ linesAdded: 20, linesRemoved: 5, filesChanged: [
          { path: 'src/utils.ts', changeType: 'modified', linesAdded: 20, linesRemoved: 5 },
          { path: 'src/utils.test.ts', changeType: 'modified', linesAdded: 30, linesRemoved: 0 },
        ]}),
        makeTrajectory(),
      );

      expect(verdict.decision).toBe('merge');
      expect(verdict.warnings.length).toBe(0);
      expect(verdict.blockers.length).toBe(0);
    });

    it('should return "merge-with-warnings" for moderate degradation', async () => {
      const dp = new DebtPrevention(estimator, { warningThreshold: 1 });
      const pr = makePR({
        linesAdded: 300,
        linesRemoved: 10,
        filesChanged: [
          { path: 'src/big-feature.ts', changeType: 'added', linesAdded: 300, linesRemoved: 0 },
        ],
      });

      const verdict = await dp.analyze(pr, makeTrajectory());
      expect(verdict.decision).toBe('merge-with-warnings');
      expect(verdict.warnings.length).toBeGreaterThan(0);
    });

    it('should return "block" for severe degradation', async () => {
      const dp = new DebtPrevention(estimator, { blockThreshold: 3 });
      const files = Array.from({ length: 25 }, (_, i) => ({
        path: `src/module-${i}/index.ts`,
        changeType: 'modified' as const,
        linesAdded: 100,
        linesRemoved: 5,
        complexityDelta: 3,
      }));

      const pr = makePR({
        linesAdded: 2500,
        linesRemoved: 125,
        filesChanged: files,
      });

      const verdict = await dp.analyze(pr, makeTrajectory());
      expect(verdict.decision).toBe('block');
      expect(verdict.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('analyze — anti-pattern acceleration', () => {
    it('should detect when PR accelerates an approaching anti-pattern', async () => {
      const dp = new DebtPrevention(estimator);
      const trajectory = makeTrajectory({
        approachingAntiPatterns: [{
          type: 'god-class',
          module: 'src/service.ts',
          currentSeverity: 60,
          threshold: 80,
          sprintsUntilThreshold: 3,
        }],
      });

      const pr = makePR({
        linesAdded: 500,
        linesRemoved: 10,
        filesChanged: [
          { path: 'src/service.ts', changeType: 'modified', linesAdded: 500, linesRemoved: 10, complexityDelta: 10 },
        ],
      });

      const verdict = await dp.analyze(pr, trajectory);
      expect(verdict.acceleratedPatterns.length).toBeGreaterThan(0);
    });

    it('should block when anti-pattern will breach within 1 sprint', async () => {
      const dp = new DebtPrevention(estimator);
      const trajectory = makeTrajectory({
        approachingAntiPatterns: [{
          type: 'complexity-spiral',
          module: 'src/engine.ts',
          currentSeverity: 75,
          threshold: 80,
          sprintsUntilThreshold: 1.5,
        }],
      });

      const pr = makePR({
        linesAdded: 400,
        linesRemoved: 0,
        filesChanged: [
          { path: 'src/engine.ts', changeType: 'modified', linesAdded: 400, linesRemoved: 0, complexityDelta: 8 },
        ],
      });

      const verdict = await dp.analyze(pr, trajectory);
      const imminent = verdict.acceleratedPatterns.filter(a => a.sprintsAfter <= 1);
      if (imminent.length > 0) {
        expect(verdict.blockers.length).toBeGreaterThan(0);
      }
    });
  });

  describe('analyze — risk score', () => {
    it('should return 0 risk for clean PRs', async () => {
      const dp = new DebtPrevention(estimator);
      const pr = makePR({
        linesAdded: 5,
        linesRemoved: 5,
        filesChanged: [
          { path: 'src/utils.ts', changeType: 'modified', linesAdded: 5, linesRemoved: 5 },
          { path: 'src/utils.test.ts', changeType: 'modified', linesAdded: 10, linesRemoved: 0 },
        ],
      });

      const verdict = await dp.analyze(pr, makeTrajectory());
      expect(verdict.riskScore).toBeLessThanOrEqual(10);
    });

    it('should cap risk at 100', async () => {
      const dp = new DebtPrevention(estimator);
      const files = Array.from({ length: 30 }, (_, i) => ({
        path: `src/auth/module-${i}.ts`,
        changeType: 'modified' as const,
        linesAdded: 200,
        linesRemoved: 0,
        complexityDelta: 10,
      }));

      const trajectory = makeTrajectory({
        approachingAntiPatterns: Array.from({ length: 5 }, (_, i) => ({
          type: `pattern-${i}`,
          module: `src/mod-${i}`,
          currentSeverity: 90,
          threshold: 100,
          sprintsUntilThreshold: 0.5,
        })),
      });

      const verdict = await dp.analyze(
        makePR({ linesAdded: 6000, linesRemoved: 0, filesChanged: files }),
        trajectory,
      );
      expect(verdict.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('analyze — recommendations', () => {
    it('should recommend adding tests when coverage drops', async () => {
      const dp = new DebtPrevention(estimator);
      const pr = makePR({
        filesChanged: [
          { path: 'src/service.ts', changeType: 'modified', linesAdded: 100, linesRemoved: 5 },
          { path: 'src/repo.ts', changeType: 'modified', linesAdded: 50, linesRemoved: 0 },
        ],
      });

      const verdict = await dp.analyze(pr, makeTrajectory());
      const testRec = verdict.recommendations.find(r => r.toLowerCase().includes('test'));
      expect(testRec).toBeDefined();
    });
  });

  describe('analyze — dimension impacts', () => {
    it('should report all dimension deltas', async () => {
      const dp = new DebtPrevention(estimator);
      const verdict = await dp.analyze(makePR(), makeTrajectory());

      expect(verdict.dimensionImpacts.length).toBe(6);
      const dims = verdict.dimensionImpacts.map(i => i.dimension);
      expect(dims).toContain('complexity');
      expect(dims).toContain('security');
      expect(dims).toContain('testCoverage');
    });
  });
});
