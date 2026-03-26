/**
 * Tests for Drift Detector
 */
import { DriftDetector } from '../drift-detector';
import type { ADRConstraint, CodebaseInspector, DriftResult } from '../drift-detector';

// ─── Mock Inspector ─────────────────────────────────────────

function makeInspector(overrides?: Partial<CodebaseInspector>): CodebaseInspector {
  return {
    getImports: () => new Map([
      ['src/service.ts', ['src/repo.ts', 'express']],
      ['src/repo.ts', ['pg', 'src/models.ts']],
      ['src/controller.ts', ['src/service.ts', 'express']],
    ]),
    getFiles: () => ['src/service.ts', 'src/repo.ts', 'src/controller.ts', 'src/models.ts'],
    findUsages: (pattern: string) => {
      if (pattern === 'express') return [{ file: 'src/controller.ts', line: 1, snippet: "import express from 'express'" }];
      if (pattern === 'pg') return [{ file: 'src/repo.ts', line: 1, snippet: "import { Pool } from 'pg'" }];
      if (pattern === 'moment') return []; // not used
      if (pattern === 'Repository') return [{ file: 'src/repo.ts', line: 5, snippet: 'class UserRepository' }];
      return [];
    },
    getLayers: () => new Map([
      ['presentation', ['src/controller.ts']],
      ['service', ['src/service.ts']],
      ['data', ['src/repo.ts', 'src/models.ts']],
    ]),
    ...overrides,
  };
}

// ─── ADR Fixtures ───────────────────────────────────────────

const ADR_TECH_MANDATE: ADRConstraint = {
  adrId: 'ADR-001',
  title: 'Use Express for HTTP',
  status: 'accepted',
  date: '2025-01-01',
  constraints: [{
    type: 'technology-mandate',
    description: 'Use Express for HTTP layer',
    rule: { technology: 'express' },
  }],
};

const ADR_TECH_BAN: ADRConstraint = {
  adrId: 'ADR-002',
  title: 'Ban Moment.js',
  status: 'accepted',
  date: '2025-01-01',
  constraints: [{
    type: 'technology-ban',
    description: 'Use date-fns instead of moment',
    rule: { technology: 'moment', reason: 'bundle size' },
  }],
};

const ADR_LAYER_RULE: ADRConstraint = {
  adrId: 'ADR-003',
  title: 'Layer architecture',
  status: 'accepted',
  date: '2025-01-01',
  constraints: [{
    type: 'layer-rule',
    description: 'Data layer cannot import presentation',
    rule: { from: 'data', cannotImport: 'presentation' },
  }],
};

const ADR_DEPENDENCY_FORBIDDEN: ADRConstraint = {
  adrId: 'ADR-004',
  title: 'No direct pg usage in service layer',
  status: 'accepted',
  date: '2025-01-01',
  constraints: [{
    type: 'dependency-rule',
    description: 'Forbid direct pg usage',
    rule: { forbidden: 'pg' },
  }],
};

const ADR_PATTERN_MANDATE: ADRConstraint = {
  adrId: 'ADR-005',
  title: 'Repository pattern',
  status: 'accepted',
  date: '2025-01-01',
  constraints: [{
    type: 'pattern-mandate',
    description: 'All data access through Repository pattern',
    rule: { pattern: 'Repository', scope: 'data layer' },
  }],
};

const ADR_SUPERSEDED: ADRConstraint = {
  adrId: 'ADR-099',
  title: 'Old decision',
  status: 'superseded',
  date: '2024-01-01',
  constraints: [{
    type: 'technology-ban',
    description: 'Ban something',
    rule: { technology: 'express' },
  }],
};

// ─── Tests ──────────────────────────────────────────────────

describe('DriftDetector', () => {
  describe('detect — technology mandates', () => {
    it('should pass when mandated technology is used', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_TECH_MANDATE]);
      expect(result.drifts.length).toBe(0);
      expect(result.compliant.length).toBe(1);
      expect(result.driftScore).toBe(100);
    });

    it('should detect drift when mandated technology is missing', () => {
      const inspector = makeInspector({
        findUsages: () => [], // nothing found
      });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_TECH_MANDATE]);
      expect(result.drifts.length).toBe(1);
      expect(result.drifts[0].adrId).toBe('ADR-001');
      expect(result.drifts[0].severity).toBe('high');
    });
  });

  describe('detect — technology bans', () => {
    it('should pass when banned technology is not used', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_TECH_BAN]);
      expect(result.drifts.length).toBe(0);
    });

    it('should detect drift when banned technology is used', () => {
      const inspector = makeInspector({
        findUsages: (pattern) => {
          if (pattern === 'moment') return [{ file: 'src/utils.ts', line: 1, snippet: "import moment from 'moment'" }];
          return [];
        },
      });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_TECH_BAN]);
      expect(result.drifts.length).toBe(1);
      expect(result.drifts[0].constraintType).toBe('technology-ban');
    });
  });

  describe('detect — layer rules', () => {
    it('should pass when layer dependencies are valid', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_LAYER_RULE]);
      expect(result.drifts.length).toBe(0);
    });

    it('should detect layer violation', () => {
      const inspector = makeInspector({
        getImports: () => new Map([
          ['src/repo.ts', ['src/controller.ts']], // data → presentation (forbidden!)
          ['src/controller.ts', []],
        ]),
      });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_LAYER_RULE]);
      expect(result.drifts.length).toBe(1);
      expect(result.drifts[0].description).toContain("'data' imports from forbidden layer 'presentation'");
    });
  });

  describe('detect — dependency rules', () => {
    it('should detect forbidden dependency usage', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_DEPENDENCY_FORBIDDEN]);
      expect(result.drifts.length).toBe(1);
      expect(result.drifts[0].description).toContain("'pg'");
    });
  });

  describe('detect — pattern mandates', () => {
    it('should pass when pattern is found', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_PATTERN_MANDATE]);
      expect(result.drifts.length).toBe(0);
    });

    it('should detect missing pattern', () => {
      const inspector = makeInspector({
        findUsages: () => [],
      });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_PATTERN_MANDATE]);
      expect(result.drifts.length).toBe(1);
      expect(result.drifts[0].constraintType).toBe('pattern-mandate');
    });
  });

  describe('detect — naming rules', () => {
    it('should detect files violating naming convention', () => {
      const adr: ADRConstraint = {
        adrId: 'ADR-006',
        title: 'Kebab-case files',
        status: 'accepted',
        date: '2025-01-01',
        constraints: [{
          type: 'naming-rule',
          description: 'All files must be kebab-case .ts',
          rule: { pattern: '^src/[a-z-]+\\.ts$' },
        }],
      };
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([adr]);
      // src/models.ts passes, src/service.ts passes, etc.
      expect(result.constraintsChecked).toBe(1);
    });
  });

  describe('detect — superseded ADRs', () => {
    it('should skip superseded ADRs', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_SUPERSEDED]);
      expect(result.adrsEvaluated).toBe(0);
      expect(result.constraintsChecked).toBe(0);
    });
  });

  describe('detect — multiple ADRs', () => {
    it('should evaluate all active ADRs', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([
        ADR_TECH_MANDATE,
        ADR_TECH_BAN,
        ADR_LAYER_RULE,
        ADR_PATTERN_MANDATE,
        ADR_SUPERSEDED,
      ]);
      expect(result.adrsEvaluated).toBe(4); // superseded excluded
      expect(result.constraintsChecked).toBe(4);
    });

    it('should calculate drift score as compliance percentage', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_TECH_MANDATE, ADR_TECH_BAN, ADR_LAYER_RULE]);
      // All 3 should be compliant
      expect(result.driftScore).toBe(100);
    });
  });

  describe('detect — summary', () => {
    it('should report full compliance', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_TECH_MANDATE]);
      expect(result.summary).toContain('fully compliant');
    });

    it('should report drifts in summary', () => {
      const inspector = makeInspector({ findUsages: () => [] });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_TECH_MANDATE]);
      expect(result.summary).toContain('Drift score');
    });
  });

  describe('toFindings', () => {
    it('should convert drifts to GuidanceFinding format', () => {
      const inspector = makeInspector({ findUsages: () => [] });
      const detector = new DriftDetector(inspector);
      const result = detector.detect([ADR_TECH_MANDATE]);
      const findings = detector.toFindings(result);

      expect(findings.length).toBe(1);
      expect(findings[0].id).toContain('drift-ADR-001');
      expect(findings[0].skillSource).toBe('drift-detector');
      expect(findings[0].severity).toBe('high');
    });

    it('should return empty for fully compliant result', () => {
      const detector = new DriftDetector(makeInspector());
      const result = detector.detect([ADR_TECH_MANDATE]);
      const findings = detector.toFindings(result);
      expect(findings.length).toBe(0);
    });
  });
});
