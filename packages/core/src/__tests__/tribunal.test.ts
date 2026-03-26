/**
 * Tests for Agent Tribunal Pattern
 */
import { Tribunal } from '../tribunal';
import type { TribunalAgent, AgentVerdict, TribunalFinding, AgentRole } from '../tribunal';

// ─── Test Helpers ───────────────────────────────────────────

function makeFinding(overrides?: Partial<TribunalFinding>): TribunalFinding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Finding',
    description: 'Test description',
    severity: 'high',
    category: 'security',
    source: 'architect',
    affectedFiles: ['src/service.ts'],
    recommendation: 'Fix this',
    ...overrides,
  };
}

function makeAgent(role: AgentRole, score: number, findings: TribunalFinding[] = [], delay = 0): TribunalAgent {
  return {
    role,
    analyze: async () => {
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      return {
        role,
        score,
        findings,
        summary: `${role} analysis complete`,
        duration: delay,
      };
    },
  };
}

function makeFailingAgent(role: AgentRole): TribunalAgent {
  return {
    role,
    analyze: async () => { throw new Error(`${role} agent crashed`); },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('Tribunal', () => {
  describe('constructor', () => {
    it('should throw if no agents provided', () => {
      expect(() => new Tribunal([])).toThrow('at least one agent');
    });

    it('should accept agents with custom config', () => {
      const agents = [makeAgent('architect', 80)];
      const tribunal = new Tribunal(agents, { agentTimeout: 5000 });
      expect(tribunal).toBeDefined();
    });
  });

  describe('convene — parallel execution', () => {
    it('should run all agents and produce a verdict', async () => {
      const tribunal = new Tribunal([
        makeAgent('architect', 80),
        makeAgent('security', 70),
        makeAgent('quality', 90),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.agents.length).toBe(3);
      expect(verdict.score).toBeGreaterThan(0);
      expect(verdict.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute agents in parallel', async () => {
      const start = Date.now();
      const tribunal = new Tribunal([
        makeAgent('architect', 80, [], 50),
        makeAgent('security', 70, [], 50),
        makeAgent('quality', 90, [], 50),
      ]);

      await tribunal.convene('/project');
      const elapsed = Date.now() - start;
      // Parallel: should take ~50ms, not ~150ms
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('convene — weighted scoring', () => {
    it('should weight security higher by default', async () => {
      const tribunal = new Tribunal([
        makeAgent('architect', 100), // weight 1.0
        makeAgent('security', 0),    // weight 1.2
        makeAgent('quality', 100),   // weight 1.0
      ]);

      const verdict = await tribunal.convene('/project');
      // (100*1.0 + 0*1.2 + 100*1.0) / (1.0 + 1.2 + 1.0) = 200/3.2 = 62.5
      expect(verdict.score).toBe(63); // rounded
    });

    it('should apply custom weights', async () => {
      const tribunal = new Tribunal(
        [makeAgent('architect', 50), makeAgent('security', 100)],
        { weights: { architect: 2.0, security: 1.0, quality: 1.0 } },
      );

      const verdict = await tribunal.convene('/project');
      // (50*2.0 + 100*1.0) / (2.0 + 1.0) = 200/3.0 = 66.67
      expect(verdict.score).toBe(67);
    });
  });

  describe('convene — consensus detection', () => {
    it('should detect consensus when multiple agents agree', async () => {
      const sharedFinding = makeFinding({ category: 'security', severity: 'high', affectedFiles: ['auth.ts'] });
      const tribunal = new Tribunal([
        makeAgent('architect', 70, [sharedFinding]),
        makeAgent('security', 60, [{ ...sharedFinding, source: 'security' }]),
        makeAgent('quality', 80),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.consensus.length).toBe(1);
      expect(verdict.consensus[0].agreedBy.length).toBe(2);
      expect(verdict.consensus[0].confidence).toBeCloseTo(2 / 3);
    });

    it('should sort consensus by confidence descending', async () => {
      const f1 = makeFinding({ category: 'security', severity: 'high', affectedFiles: ['a.ts'] });
      const f2 = makeFinding({ category: 'performance', severity: 'medium', affectedFiles: ['b.ts'] });

      const tribunal = new Tribunal([
        makeAgent('architect', 70, [f1, f2]),
        makeAgent('security', 60, [{ ...f1, source: 'security' }, { ...f2, source: 'security' }]),
        makeAgent('quality', 80, [{ ...f1, source: 'quality' }]),
      ]);

      const verdict = await tribunal.convene('/project');
      // f1 agreed by 3 agents (conf 1.0), f2 agreed by 2 (conf 0.67)
      expect(verdict.consensus[0].confidence).toBeGreaterThanOrEqual(verdict.consensus[1].confidence);
    });
  });

  describe('convene — dispute detection', () => {
    it('should detect disputes when only one agent flags an issue', async () => {
      const uniqueFinding = makeFinding({ category: 'naming', severity: 'low', affectedFiles: ['utils.ts'] });
      const tribunal = new Tribunal([
        makeAgent('architect', 70, [uniqueFinding]),
        makeAgent('security', 80),
        makeAgent('quality', 90),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.disputes.length).toBe(1);
      expect(verdict.disputes[0].raisedBy).toBe('architect');
      expect(verdict.disputes[0].rejectedBy).toContain('security');
      expect(verdict.disputes[0].rejectedBy).toContain('quality');
    });
  });

  describe('convene — confidence assessment', () => {
    it('should return high confidence when mostly consensus', async () => {
      const f = makeFinding({ category: 'sec', severity: 'high', affectedFiles: ['a.ts'] });
      const tribunal = new Tribunal([
        makeAgent('architect', 70, [f]),
        makeAgent('security', 60, [{ ...f, source: 'security' }]),
        makeAgent('quality', 80, [{ ...f, source: 'quality' }]),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.confidence).toBe('high');
    });

    it('should return low confidence with fewer than 2 agents', async () => {
      const tribunal = new Tribunal([makeAgent('architect', 70, [makeFinding()])]);
      const verdict = await tribunal.convene('/project');
      expect(verdict.confidence).toBe('low');
    });

    it('should return high confidence when no findings', async () => {
      const tribunal = new Tribunal([
        makeAgent('architect', 80),
        makeAgent('security', 85),
      ]);
      const verdict = await tribunal.convene('/project');
      expect(verdict.confidence).toBe('high');
    });
  });

  describe('convene — recommendations', () => {
    it('should synthesize recommendations from consensus', async () => {
      const f = makeFinding({
        category: 'security',
        severity: 'critical',
        affectedFiles: ['auth.ts'],
        recommendation: 'Use parameterized queries',
      });
      const tribunal = new Tribunal([
        makeAgent('architect', 70, [f]),
        makeAgent('security', 60, [{ ...f, source: 'security' }]),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.recommendations.length).toBeGreaterThan(0);
      expect(verdict.recommendations[0]).toContain('parameterized queries');
    });

    it('should include critical/high disputes in recommendations', async () => {
      const f = makeFinding({
        category: 'unique',
        severity: 'critical',
        affectedFiles: ['danger.ts'],
        recommendation: 'Refactor danger module',
      });
      const tribunal = new Tribunal([
        makeAgent('architect', 70, [f]),
        makeAgent('security', 80),
        makeAgent('quality', 90),
      ]);

      const verdict = await tribunal.convene('/project');
      const disputeRec = verdict.recommendations.find(r => r.includes('needs human review'));
      expect(disputeRec).toBeDefined();
    });

    it('should cap recommendations at 10', async () => {
      const findings = Array.from({ length: 15 }, (_, i) =>
        makeFinding({ category: `cat-${i}`, severity: 'critical', affectedFiles: [`f${i}.ts`] }),
      );
      const tribunal = new Tribunal([
        makeAgent('architect', 30, findings),
        makeAgent('security', 30, findings.map(f => ({ ...f, source: 'security' as AgentRole }))),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.recommendations.length).toBeLessThanOrEqual(10);
    });
  });

  describe('convene — failure tolerance', () => {
    it('should tolerate agent failures by default', async () => {
      const tribunal = new Tribunal([
        makeAgent('architect', 80),
        makeFailingAgent('security'),
        makeAgent('quality', 90),
      ]);

      const verdict = await tribunal.convene('/project');
      expect(verdict.agents.length).toBe(2); // security excluded
    });

    it('should throw when tolerateFailures is false', async () => {
      const tribunal = new Tribunal(
        [makeAgent('architect', 80), makeFailingAgent('security')],
        { tolerateFailures: false },
      );

      await expect(tribunal.convene('/project')).rejects.toThrow('Agent failed');
    });
  });

  describe('convene — timeout', () => {
    it('should timeout slow agents', async () => {
      const tribunal = new Tribunal(
        [
          makeAgent('architect', 80, [], 10),
          makeAgent('security', 70, [], 5000), // very slow
          makeAgent('quality', 90, [], 10),
        ],
        { agentTimeout: 100 },
      );

      const verdict = await tribunal.convene('/project');
      // Security agent timed out, tolerated by default
      expect(verdict.agents.length).toBe(2);
    });
  });
});
