/**
 * Tests for Autonomous Remediation Engine
 */
import { RemediationEngine } from '../remediation';
import type {
  FileSystemAdapter,
  ValidatorAdapter,
  FixGenerator,
  SubAgentVerifier,
  FixStrategy,
  VerificationResult,
  RemediationPlan,
} from '../remediation';
import type { GuidanceFinding } from '@camilooscargbaptista/nexus-types';

// ─── Helpers ────────────────────────────────────────────────

function makeFinding(id: string, severity: string = 'critical'): GuidanceFinding {
  return {
    id,
    title: `Finding ${id}`,
    description: `Desc ${id}`,
    severity: severity as any,
    skillSource: 'test',
    affectedFiles: ['src/service.ts'],
  };
}

function makeFS(files: Record<string, string> = {}): FileSystemAdapter {
  const store = new Map(Object.entries(files));
  return {
    readFile: async (path) => store.get(path) ?? '',
    writeFile: async (path, content) => { store.set(path, content); },
    fileExists: async (path) => store.has(path),
    listFiles: async () => Array.from(store.keys()),
  };
}

function makeValidator(scoreSequence: number[] = [70, 75]): ValidatorAdapter {
  let callIndex = 0;
  return {
    getScore: async () => {
      const score = scoreSequence[Math.min(callIndex++, scoreSequence.length - 1)];
      return score;
    },
    validate: async () => {
      const score = scoreSequence[Math.min(callIndex++, scoreSequence.length - 1)];
      return { score, findings: [] };
    },
  };
}

function makeFixGenerator(strategy?: Partial<FixStrategy>): FixGenerator {
  return {
    generateStrategy: async () => ({
      type: 'patch',
      description: 'Test fix',
      steps: [{
        action: 'modify',
        target: 'src/service.ts',
        description: 'Fix vulnerability',
        patch: {
          file: 'src/service.ts',
          hunks: [{ startLine: 1, removeLines: ['bad code'], addLines: ['good code'] }],
        },
      }],
      rollbackPlan: 'Revert patch',
      ...strategy,
    }),
  };
}

function makeSubAgent(passed: boolean = true): SubAgentVerifier {
  return {
    verify: async () => ({
      passed,
      scoreBefore: 70,
      scoreAfter: passed ? 75 : 68,
      improvement: passed ? 5 : -2,
      regressions: passed ? [] : ['New regression found'],
      details: passed ? 'Sub-agent verified' : 'Sub-agent rejected',
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('RemediationEngine', () => {
  const files = { '/project/src/service.ts': 'bad code\nmore code' };

  describe('remediate — basic flow', () => {
    it('should auto-fix a critical finding successfully', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator([70, 75]),
        makeFixGenerator(),
        makeSubAgent(true),
      );

      const report = await engine.remediate('/project', [makeFinding('f1', 'critical')]);
      expect(report.succeeded).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.results[0].success).toBe(true);
      expect(report.results[0].verification.improvement).toBe(5);
    });

    it('should skip findings below minSeverity', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator(),
        makeFixGenerator(),
        undefined,
        { minSeverity: 'high' },
      );

      const report = await engine.remediate('/project', [
        makeFinding('f1', 'critical'),
        makeFinding('f2', 'low'),
        makeFinding('f3', 'medium'),
      ]);
      expect(report.attempted).toBe(1); // only critical+high
      expect(report.skipped).toBe(2);
    });

    it('should prioritize critical over high', async () => {
      const order: string[] = [];
      const fixGen: FixGenerator = {
        generateStrategy: async (finding) => {
          order.push(finding.id);
          return makeFixGenerator().generateStrategy(finding, new Map());
        },
      };

      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator([70, 75, 70, 75]),
        fixGen,
        makeSubAgent(true),
      );

      await engine.remediate('/project', [
        makeFinding('high-1', 'high'),
        makeFinding('crit-1', 'critical'),
      ]);

      expect(order[0]).toBe('crit-1'); // critical first
    });
  });

  describe('remediate — verification failure', () => {
    it('should reject fix when score does not improve', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator([70, 70, 70, 70]), // score never improves
        makeFixGenerator(),
        undefined,
        { requireSubAgentVerification: false, maxAttempts: 2 },
      );

      const report = await engine.remediate('/project', [makeFinding('f1')]);
      expect(report.succeeded).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.results[0].attempts).toBe(2);
    });

    it('should reject fix when sub-agent rejects', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator([70, 75]),
        makeFixGenerator(),
        makeSubAgent(false),
        { maxAttempts: 1 },
      );

      const report = await engine.remediate('/project', [makeFinding('f1')]);
      expect(report.succeeded).toBe(0);
      expect(report.results[0].verification.details).toContain('Sub-agent rejected');
    });
  });

  describe('remediate — dry run', () => {
    it('should plan but not apply fixes in dry-run mode', async () => {
      const fs = makeFS(files);
      const engine = new RemediationEngine(
        fs,
        makeValidator(),
        makeFixGenerator(),
        undefined,
        { dryRun: true },
      );

      const report = await engine.remediate('/project', [makeFinding('f1')]);
      expect(report.results[0].success).toBe(false);
      expect(report.results[0].plan.status).toBe('planned');
      expect(report.results[0].appliedPatches.length).toBe(0);
      // File should not be modified
      const content = await fs.readFile('/project/src/service.ts');
      expect(content).toBe('bad code\nmore code');
    });
  });

  describe('remediate — retry logic', () => {
    it('should retry up to maxAttempts', async () => {
      let attempts = 0;
      const validator: ValidatorAdapter = {
        getScore: async () => 70,
        validate: async () => {
          attempts++;
          // Only succeed on third attempt
          const score = attempts >= 3 ? 75 : 70;
          return { score, findings: [] };
        },
      };

      const engine = new RemediationEngine(
        makeFS(files),
        validator,
        makeFixGenerator(),
        undefined,
        { maxAttempts: 3, requireSubAgentVerification: false },
      );

      const report = await engine.remediate('/project', [makeFinding('f1')]);
      expect(report.results[0].success).toBe(true);
      expect(report.results[0].attempts).toBe(3);
    });
  });

  describe('report aggregation', () => {
    it('should calculate total score improvement', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator([70, 75]),
        makeFixGenerator(),
        makeSubAgent(true),
      );

      const report = await engine.remediate('/project', [makeFinding('f1')]);
      expect(report.totalScoreImprovement).toBe(5);
      expect(report.duration).toBeGreaterThanOrEqual(0);
    });

    it('should report empty results for no eligible findings', async () => {
      const engine = new RemediationEngine(
        makeFS(files),
        makeValidator(),
        makeFixGenerator(),
        undefined,
        { minSeverity: 'critical' },
      );

      const report = await engine.remediate('/project', [makeFinding('f1', 'low')]);
      expect(report.attempted).toBe(0);
      expect(report.skipped).toBe(1);
      expect(report.results.length).toBe(0);
    });
  });
});
