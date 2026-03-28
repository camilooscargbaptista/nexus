/**
 * Tests for Skill Composer — Dynamic pipeline chaining
 */
import { SkillComposer, BUILT_IN_PIPELINES } from '../skill-composer';
import type { SkillExecutor, CompositionPipeline } from '../skill-composer';
import type { ArchitectureSnapshot, GuidanceResult, GuidanceFinding, Recommendation, SkillCategory, EffortEstimate, ConfidenceLevel } from '@camilooscargbaptista/nexus-types';

// ─── Test Helpers ───────────────────────────────────────────

function makeFinding(id: string, severity: string = 'high'): GuidanceFinding {
  return {
    id,
    title: `Finding ${id}`,
    description: `Description for ${id}`,
    severity: severity as any,
    skillSource: 'test-skill',
    affectedFiles: ['test.ts'],
  };
}

function makeRecommendation(id: string): Recommendation {
  return {
    id,
    title: `Rec ${id}`,
    description: `Recommendation ${id}`,
    priority: 'high' as any,
    effort: { hours: 4, size: 'M', complexity: 'medium' } as EffortEstimate,
    impact: 'high' as any,
    linkedFindings: [id],
  };
}

function makeGuidance(findings: GuidanceFinding[] = [], recommendations: Recommendation[] = []): GuidanceResult {
  return {
    skillName: 'test-skill',
    category: 'code-review' as any,
    findings,
    recommendations,
    estimatedEffort: { hours: 4, size: 'M', complexity: 'medium' } as EffortEstimate,
    confidence: 'high' as any,
  };
}

function makeSnapshot(overrides?: Partial<ArchitectureSnapshot>): ArchitectureSnapshot {
  return {
    projectPath: '/test',
    projectName: 'test-project',
    analyzedAt: new Date().toISOString(),
    score: { overall: 75, modularity: 70, coupling: 80, cohesion: 75, layering: 70 },
    layers: [],
    patterns: [],
    antiPatterns: [],
    dependencies: { internal: [], external: [] },
    metrics: { totalFiles: 10, totalLines: 1000, languages: {} },
    ...overrides,
  } as ArchitectureSnapshot;
}

function makeExecutor(findingsPerStep: GuidanceFinding[][] = [[]]): SkillExecutor {
  let callIndex = 0;
  return {
    execute: async (skillName, snapshot, previousFindings) => {
      const findings = findingsPerStep[callIndex] ?? [];
      callIndex++;
      return makeGuidance(findings, findings.map(f => makeRecommendation(f.id)));
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('SkillComposer', () => {
  describe('compose — basic pipeline', () => {
    it('should execute all steps in sequence', async () => {
      const calls: string[] = [];
      const executor: SkillExecutor = {
        execute: async (skillName) => {
          calls.push(skillName);
          return makeGuidance();
        },
      };

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test-pipe',
        description: 'Test',
        steps: [
          { skillName: 'step-1' },
          { skillName: 'step-2' },
          { skillName: 'step-3' },
        ],
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(calls).toEqual(['step-1', 'step-2', 'step-3']);
      expect(result.steps.length).toBe(3);
      expect(result.pipeline).toBe('test-pipe');
    });

    it('should accumulate findings across steps', async () => {
      const executor = makeExecutor([
        [makeFinding('f1'), makeFinding('f2')],
        [makeFinding('f3')],
      ]);

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }, { skillName: 's2' }],
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(result.totalFindings).toBe(3);
      expect(result.combinedFindings.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
    });

    it('should deduplicate findings by id', async () => {
      const executor = makeExecutor([
        [makeFinding('f1'), makeFinding('f2')],
        [makeFinding('f1'), makeFinding('f3')],
      ]);

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }, { skillName: 's2' }],
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(result.totalFindings).toBe(3);
    });
  });

  describe('compose — filterSeverity', () => {
    it('should filter findings passed to next step by severity', async () => {
      let receivedPrevious: GuidanceFinding[] | undefined;
      const executor: SkillExecutor = {
        execute: async (skillName, snapshot, prev) => {
          if (skillName === 's2') receivedPrevious = prev;
          if (skillName === 's1') {
            return makeGuidance([
              makeFinding('f1', 'critical'),
              makeFinding('f2', 'low'),
              makeFinding('f3', 'high'),
            ]);
          }
          return makeGuidance();
        },
      };

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [
          { skillName: 's1' },
          { skillName: 's2', filterSeverity: ['critical', 'high'] },
        ],
      };

      await composer.compose(pipeline, makeSnapshot());
      expect(receivedPrevious).toBeDefined();
      expect(receivedPrevious!.length).toBe(2);
      expect(receivedPrevious!.map(f => f.severity)).toEqual(['critical', 'high']);
    });
  });

  describe('compose — haltOnCritical', () => {
    it('should stop pipeline when critical finding found', async () => {
      const calls: string[] = [];
      const executor: SkillExecutor = {
        execute: async (skillName) => {
          calls.push(skillName);
          if (skillName === 's2') {
            return makeGuidance([makeFinding('crit', 'critical')]);
          }
          return makeGuidance();
        },
      };

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }, { skillName: 's2' }, { skillName: 's3' }],
        haltOnCritical: true,
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(calls).toEqual(['s1', 's2']);
      expect(result.steps.length).toBe(2);
    });

    it('should continue pipeline when haltOnCritical is false', async () => {
      const calls: string[] = [];
      const executor: SkillExecutor = {
        execute: async (skillName) => {
          calls.push(skillName);
          if (skillName === 's1') {
            return makeGuidance([makeFinding('crit', 'critical')]);
          }
          return makeGuidance();
        },
      };

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }, { skillName: 's2' }],
        haltOnCritical: false,
      };

      await composer.compose(pipeline, makeSnapshot());
      expect(calls).toEqual(['s1', 's2']);
    });
  });

  describe('compose — step metadata', () => {
    it('should track input/output finding counts per step', async () => {
      const executor = makeExecutor([
        [makeFinding('f1'), makeFinding('f2')],
        [makeFinding('f3')],
      ]);

      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }, { skillName: 's2' }],
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(result.steps[0].inputFindingsCount).toBe(0);
      expect(result.steps[0].outputFindingsCount).toBe(2);
      expect(result.steps[1].inputFindingsCount).toBe(2);
      expect(result.steps[1].outputFindingsCount).toBe(1);
    });

    it('should include duration per step', async () => {
      const executor = makeExecutor([[]]);
      const composer = new SkillComposer(executor);
      const pipeline: CompositionPipeline = {
        name: 'test',
        description: 'Test',
        steps: [{ skillName: 's1' }],
      };

      const result = await composer.compose(pipeline, makeSnapshot());
      expect(result.steps[0].duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listPipelines', () => {
    it('should return built-in pipelines', () => {
      const composer = new SkillComposer(makeExecutor());
      const pipelines = composer.listPipelines();
      expect(pipelines.length).toBe(BUILT_IN_PIPELINES.length);
      expect(pipelines.map(p => p.name)).toContain('security-deep-dive');
      expect(pipelines.map(p => p.name)).toContain('full-review');
    });
  });

  describe('suggestPipeline', () => {
    const composer = new SkillComposer(makeExecutor());

    it('should suggest security-deep-dive for security issues', () => {
      const snapshot = makeSnapshot({
        antiPatterns: [{
          pattern: 'hardcoded_secret',
          severity: 'critical',
          location: 'config.ts',
          description: 'Secret found',
          affectedFiles: ['config.ts'],
        }] as any,
      });
      const suggestion = composer.suggestPipeline(snapshot);
      expect(suggestion?.name).toBe('security-deep-dive');
    });

    it('should suggest architecture-healing for architecture issues', () => {
      const snapshot = makeSnapshot({
        antiPatterns: [{
          pattern: 'god_class',
          severity: 'high',
          location: 'app.ts',
          description: 'Too large',
          affectedFiles: ['app.ts'],
        }] as any,
      });
      const suggestion = composer.suggestPipeline(snapshot);
      expect(suggestion?.name).toBe('architecture-healing');
    });

    it('should suggest full-review for low overall score', () => {
      const snapshot = makeSnapshot({
        score: { overall: 40, modularity: 30, coupling: 50, cohesion: 35, layering: 40 },
        antiPatterns: [],
      });
      const suggestion = composer.suggestPipeline(snapshot);
      expect(suggestion?.name).toBe('full-review');
    });

    it('should return null when no issues detected', () => {
      const snapshot = makeSnapshot({
        score: { overall: 85, modularity: 80, coupling: 90, cohesion: 85, layering: 80 },
        antiPatterns: [],
      });
      const suggestion = composer.suggestPipeline(snapshot);
      expect(suggestion).toBeNull();
    });
  });
});
