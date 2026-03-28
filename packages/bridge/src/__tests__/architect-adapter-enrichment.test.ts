/**
 * Tests for ArchitectAdapter.enrichWithTemporal()
 *
 * Validates that temporal and forecast data is correctly
 * transformed from Architect v4 format into Nexus types.
 */

import { ArchitectAdapter } from '../architect-adapter.js';
import type {
  ArchitectTemporalReport,
  ArchitectForecastReport,
} from '../architect-adapter.js';
import type { ArchitectureSnapshot } from '@camilooscargbaptista/nexus-types';

// ═══════════════════════════════════════════════════════════════
// MOCK EVENT BUS
// ═══════════════════════════════════════════════════════════════

const mockEventBus = {
  publish: async () => {},
  subscribe: () => () => {},
  getHistory: () => [],
} as any;

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

function makeBaseSnapshot(): ArchitectureSnapshot {
  return {
    projectPath: '/test',
    projectName: 'test-project',
    timestamp: new Date().toISOString(),
    score: { overall: 75, modularity: 80, coupling: 70, cohesion: 75, layering: 72 },
    layers: [],
    antiPatterns: [],
    dependencies: [],
    frameworks: ['express'],
    domain: 'generic' as any,
    fileCount: 50,
    lineCount: 5000,
  };
}

function makeTemporalReport(): ArchitectTemporalReport {
  return {
    overallTrend: 'stable',
    overallTemporalScore: 72,
    periodWeeks: 24,
    totalCommits: 150,
    totalAuthors: 4,
    modules: [
      {
        module: 'src',
        staticScore: 75,
        temporalScore: 70,
        trend: 'stable',
        projectedScore: 68,
        riskLevel: 'medium',
        velocity: { commitAcceleration: 5, churnTrend: 10 },
        weeklyCommitRate: 3.5,
        busFactor: 3,
      },
      {
        module: 'lib',
        staticScore: 80,
        temporalScore: 82,
        trend: 'improving',
        projectedScore: 85,
        riskLevel: 'low',
        velocity: { commitAcceleration: -5, churnTrend: -15 },
        weeklyCommitRate: 1.2,
        busFactor: 2,
      },
    ],
    hotspots: [
      { path: 'src/core.ts', commits: 30, churnRate: 120, busFactor: 2 },
      { path: 'src/api.ts', commits: 20, churnRate: 80, busFactor: 1 },
    ],
  };
}

function makeForecastReport(): ArchitectForecastReport {
  return {
    outlook: 'cloudy',
    headline: 'Architecture trending stable with 2 emerging concerns.',
    preAntiPatterns: [
      {
        type: 'emerging-god-class',
        module: 'src',
        severity: 'warning',
        weeksToThreshold: 12,
        description: 'File src/core.ts growing fast',
        recommendation: 'Split into smaller modules',
        confidence: 0.75,
      },
    ],
    topRisks: ['God class forming in src/core.ts'],
    recommendations: ['Split src/core.ts before it becomes unmanageable'],
    modules: [
      {
        module: 'src',
        currentHealth: 'at-risk',
        forecast6Months: 'declining',
        bottleneckProbability: 0.4,
        riskFactors: ['Churn increasing', '1 pre-anti-pattern'],
        topAction: 'Split into smaller modules',
      },
      {
        module: 'lib',
        currentHealth: 'healthy',
        forecast6Months: 'stable',
        bottleneckProbability: 0.05,
        riskFactors: [],
        topAction: 'No action needed',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('ArchitectAdapter.enrichWithTemporal()', () => {
  let adapter: ArchitectAdapter;

  beforeEach(() => {
    adapter = new ArchitectAdapter(mockEventBus);
  });

  describe('with temporal data', () => {
    it('should add temporal field to snapshot', () => {
      const snapshot = makeBaseSnapshot();
      const temporal = makeTemporalReport();

      const enriched = adapter.enrichWithTemporal(snapshot, temporal);

      expect(enriched.temporal).toBeDefined();
      expect(enriched.temporal!.overallTrend).toBe('stable');
      expect(enriched.temporal!.overallTemporalScore).toBe(72);
      expect(enriched.temporal!.periodWeeks).toBe(24);
      expect(enriched.temporal!.totalCommits).toBe(150);
      expect(enriched.temporal!.totalAuthors).toBe(4);
    });

    it('should transform modules correctly', () => {
      const snapshot = makeBaseSnapshot();
      const temporal = makeTemporalReport();

      const enriched = adapter.enrichWithTemporal(snapshot, temporal);

      expect(enriched.temporal!.modules).toHaveLength(2);

      const src = enriched.temporal!.modules.find(m => m.module === 'src')!;
      expect(src.staticScore).toBe(75);
      expect(src.temporalScore).toBe(70);
      expect(src.trend).toBe('stable');
      expect(src.projectedScore).toBe(68);
      expect(src.riskLevel).toBe('medium');
      expect(src.weeklyCommitRate).toBe(3.5);
      expect(src.churnTrend).toBe(10);
      expect(src.busFactor).toBe(3);
    });

    it('should transform hotspots correctly', () => {
      const snapshot = makeBaseSnapshot();
      const temporal = makeTemporalReport();

      const enriched = adapter.enrichWithTemporal(snapshot, temporal);

      expect(enriched.temporal!.hotspots).toHaveLength(2);
      expect(enriched.temporal!.hotspots[0].path).toBe('src/core.ts');
      expect(enriched.temporal!.hotspots[0].commits).toBe(30);
    });

    it('should not mutate original snapshot', () => {
      const snapshot = makeBaseSnapshot();
      const temporal = makeTemporalReport();

      adapter.enrichWithTemporal(snapshot, temporal);

      expect(snapshot.temporal).toBeUndefined();
    });
  });

  describe('with forecast data', () => {
    it('should add forecast field to snapshot', () => {
      const snapshot = makeBaseSnapshot();
      const forecast = makeForecastReport();

      const enriched = adapter.enrichWithTemporal(snapshot, undefined, forecast);

      expect(enriched.forecast).toBeDefined();
      expect(enriched.forecast!.outlook).toBe('cloudy');
      expect(enriched.forecast!.headline).toContain('stable');
    });

    it('should transform pre-anti-patterns', () => {
      const snapshot = makeBaseSnapshot();
      const forecast = makeForecastReport();

      const enriched = adapter.enrichWithTemporal(snapshot, undefined, forecast);

      expect(enriched.forecast!.preAntiPatterns).toHaveLength(1);
      const pap = enriched.forecast!.preAntiPatterns[0];
      expect(pap.type).toBe('emerging-god-class');
      expect(pap.module).toBe('src');
      expect(pap.severity).toBe('warning');
      expect(pap.weeksToThreshold).toBe(12);
      expect(pap.confidence).toBe(0.75);
    });

    it('should transform module forecasts', () => {
      const snapshot = makeBaseSnapshot();
      const forecast = makeForecastReport();

      const enriched = adapter.enrichWithTemporal(snapshot, undefined, forecast);

      expect(enriched.forecast!.moduleForecast).toHaveLength(2);
      const src = enriched.forecast!.moduleForecast.find(m => m.module === 'src')!;
      expect(src.currentHealth).toBe('at-risk');
      expect(src.forecast6Months).toBe('declining');
      expect(src.bottleneckProbability).toBe(0.4);
    });
  });

  describe('with both temporal and forecast', () => {
    it('should enrich with both fields', () => {
      const snapshot = makeBaseSnapshot();
      const temporal = makeTemporalReport();
      const forecast = makeForecastReport();

      const enriched = adapter.enrichWithTemporal(snapshot, temporal, forecast);

      expect(enriched.temporal).toBeDefined();
      expect(enriched.forecast).toBeDefined();
      expect(enriched.temporal!.modules).toHaveLength(2);
      expect(enriched.forecast!.moduleForecast).toHaveLength(2);
    });
  });

  describe('without enrichment', () => {
    it('should return unchanged snapshot when no data provided', () => {
      const snapshot = makeBaseSnapshot();

      const enriched = adapter.enrichWithTemporal(snapshot);

      expect(enriched.temporal).toBeUndefined();
      expect(enriched.forecast).toBeUndefined();
      expect(enriched.score.overall).toBe(75);
    });
  });
});
