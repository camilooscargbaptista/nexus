/**
 * Tests for Feedback Loop Storage
 */
import { FeedbackStore, InMemoryPersistence } from '../feedback-store';
import type { PipelineRun, FindingOutcome, FixOutcome } from '../feedback-store';

// ─── Helpers ────────────────────────────────────────────────

function makeRun(id: string, score: number, timestamp?: string): PipelineRun {
  return {
    id,
    projectPath: '/project',
    timestamp: timestamp ?? new Date().toISOString(),
    duration: 5000,
    scores: { overall: score },
    findingsCount: 10,
    criticalCount: 1,
    highCount: 3,
    remediationsAttempted: 2,
    remediationsSucceeded: 1,
  };
}

function makeFindingOutcome(
  findingId: string,
  outcome: FindingOutcome['outcome'],
  category: string = 'security',
  runId: string = 'run-1',
): FindingOutcome {
  return {
    findingId,
    runId,
    timestamp: new Date().toISOString(),
    severity: 'high',
    category,
    outcome,
  };
}

function makeFixOutcome(
  fixId: string,
  applied: boolean,
  effective: boolean,
  runId: string = 'run-1',
): FixOutcome {
  return {
    fixId,
    findingId: `finding-${fixId}`,
    runId,
    timestamp: new Date().toISOString(),
    applied,
    reverted: !effective && applied,
    scoreBefore: 70,
    scoreAfter: effective ? 75 : 68,
    effective,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('FeedbackStore', () => {
  let store: FeedbackStore;

  beforeEach(() => {
    store = new FeedbackStore(new InMemoryPersistence());
  });

  describe('recordRun / getLatestRun', () => {
    it('should store and retrieve a run', async () => {
      await store.recordRun(makeRun('run-1', 75));
      const latest = await store.getLatestRun('/project');
      expect(latest).toBeDefined();
      expect(latest!.id).toBe('run-1');
      expect(latest!.scores.overall).toBe(75);
    });

    it('should return latest run by timestamp', async () => {
      await store.recordRun(makeRun('run-1', 70, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('run-2', 75, '2026-02-01T00:00:00Z'));
      const latest = await store.getLatestRun('/project');
      expect(latest!.id).toBe('run-2');
    });

    it('should return undefined for unknown project', async () => {
      const latest = await store.getLatestRun('/unknown');
      expect(latest).toBeUndefined();
    });
  });

  describe('queryTrends — score history', () => {
    it('should return score history in chronological order', async () => {
      await store.recordRun(makeRun('r1', 60, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 65, '2026-02-01T00:00:00Z'));
      await store.recordRun(makeRun('r3', 70, '2026-03-01T00:00:00Z'));

      const trends = await store.queryTrends();
      expect(trends.scoreHistory.length).toBe(3);
      expect(trends.scoreHistory[0].overall).toBe(60);
      expect(trends.scoreHistory[2].overall).toBe(70);
    });

    it('should calculate average score', async () => {
      await store.recordRun(makeRun('r1', 60, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 80, '2026-02-01T00:00:00Z'));

      const trends = await store.queryTrends();
      expect(trends.avgScore).toBe(70);
    });
  });

  describe('queryTrends — score trend classification', () => {
    it('should detect improving trend', async () => {
      await store.recordRun(makeRun('r1', 60, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 62, '2026-02-01T00:00:00Z'));
      await store.recordRun(makeRun('r3', 70, '2026-03-01T00:00:00Z'));
      await store.recordRun(makeRun('r4', 75, '2026-04-01T00:00:00Z'));

      const trends = await store.queryTrends();
      expect(trends.scoreTrend).toBe('improving');
    });

    it('should detect degrading trend', async () => {
      await store.recordRun(makeRun('r1', 80, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 78, '2026-02-01T00:00:00Z'));
      await store.recordRun(makeRun('r3', 70, '2026-03-01T00:00:00Z'));
      await store.recordRun(makeRun('r4', 65, '2026-04-01T00:00:00Z'));

      const trends = await store.queryTrends();
      expect(trends.scoreTrend).toBe('degrading');
    });

    it('should detect stable trend', async () => {
      await store.recordRun(makeRun('r1', 70, '2026-01-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 71, '2026-02-01T00:00:00Z'));
      await store.recordRun(makeRun('r3', 70, '2026-03-01T00:00:00Z'));
      await store.recordRun(makeRun('r4', 71, '2026-04-01T00:00:00Z'));

      const trends = await store.queryTrends();
      expect(trends.scoreTrend).toBe('stable');
    });
  });

  describe('queryTrends — false positives', () => {
    it('should track false positive categories', async () => {
      await store.recordFindingOutcome(makeFindingOutcome('f1', 'false-positive', 'security'));
      await store.recordFindingOutcome(makeFindingOutcome('f2', 'false-positive', 'security'));
      await store.recordFindingOutcome(makeFindingOutcome('f3', 'false-positive', 'style'));
      await store.recordFindingOutcome(makeFindingOutcome('f4', 'accepted', 'security'));

      const trends = await store.queryTrends();
      expect(trends.topFalsePositives.length).toBe(2);
      expect(trends.topFalsePositives[0].category).toBe('security');
      expect(trends.topFalsePositives[0].count).toBe(2);
    });
  });

  describe('queryTrends — fix effectiveness', () => {
    it('should calculate fix effectiveness percentage', async () => {
      await store.recordFixOutcome(makeFixOutcome('fix-1', true, true));
      await store.recordFixOutcome(makeFixOutcome('fix-2', true, false));
      await store.recordFixOutcome(makeFixOutcome('fix-3', true, true));
      await store.recordFixOutcome(makeFixOutcome('fix-4', false, false)); // not applied

      const trends = await store.queryTrends();
      // 2 effective out of 3 applied = 67%
      expect(trends.fixEffectiveness).toBe(67);
    });

    it('should return 0 when no fixes applied', async () => {
      const trends = await store.queryTrends();
      expect(trends.fixEffectiveness).toBe(0);
    });
  });

  describe('queryTrends — dismissed categories', () => {
    it('should track most dismissed categories', async () => {
      // Security: 2 dismissed / 5 total = 40%
      for (let i = 0; i < 3; i++) {
        await store.recordFindingOutcome(makeFindingOutcome(`s${i}`, 'accepted', 'security'));
      }
      await store.recordFindingOutcome(makeFindingOutcome('s3', 'dismissed', 'security'));
      await store.recordFindingOutcome(makeFindingOutcome('s4', 'dismissed', 'security'));

      // Style: 3 dismissed / 4 total = 75%
      await store.recordFindingOutcome(makeFindingOutcome('st1', 'accepted', 'style'));
      for (let i = 0; i < 3; i++) {
        await store.recordFindingOutcome(makeFindingOutcome(`st${i + 2}`, 'dismissed', 'style'));
      }

      const trends = await store.queryTrends();
      expect(trends.mostDismissedCategories[0].category).toBe('style');
      expect(trends.mostDismissedCategories[0].dismissRate).toBe(75);
    });
  });

  describe('getFalsePositiveRate', () => {
    it('should return rate for specific category', async () => {
      for (let i = 0; i < 8; i++) {
        await store.recordFindingOutcome(makeFindingOutcome(`f${i}`, 'accepted', 'perf'));
      }
      await store.recordFindingOutcome(makeFindingOutcome('f8', 'false-positive', 'perf'));
      await store.recordFindingOutcome(makeFindingOutcome('f9', 'false-positive', 'perf'));

      const rate = await store.getFalsePositiveRate('perf');
      expect(rate).toBe(20); // 2/10
    });

    it('should return 0 for insufficient data', async () => {
      await store.recordFindingOutcome(makeFindingOutcome('f1', 'false-positive', 'rare'));
      const rate = await store.getFalsePositiveRate('rare');
      expect(rate).toBe(0); // < 5 samples
    });
  });

  describe('query filtering', () => {
    it('should filter by project path', async () => {
      await store.recordRun({ ...makeRun('r1', 70), projectPath: '/project-a' });
      await store.recordRun({ ...makeRun('r2', 80), projectPath: '/project-b' });

      const trends = await store.queryTrends({ projectPath: '/project-a' });
      expect(trends.runs).toBe(1);
      expect(trends.avgScore).toBe(70);
    });

    it('should filter by date range', async () => {
      await store.recordRun(makeRun('r1', 60, '2025-06-01T00:00:00Z'));
      await store.recordRun(makeRun('r2', 70, '2026-01-15T00:00:00Z'));
      await store.recordRun(makeRun('r3', 80, '2026-03-01T00:00:00Z'));

      const trends = await store.queryTrends({
        fromDate: '2026-01-01T00:00:00Z',
        toDate: '2026-12-31T00:00:00Z',
      });
      expect(trends.runs).toBe(2);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.recordRun(makeRun(`r${i}`, 70 + i, `2026-0${i + 1}-01T00:00:00Z`));
      }

      const trends = await store.queryTrends({ limit: 3 });
      expect(trends.runs).toBe(3);
    });
  });
});
