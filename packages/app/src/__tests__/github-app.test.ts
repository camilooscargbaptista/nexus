/**
 * Tests for GitHub App — NexusReviewHandler + CommentFormatter
 */
import { NexusReviewHandler, CommentFormatter } from '../github-app';
import type {
  GitAdapter,
  GitHubAdapter,
  PipelineRunner,
  PipelineResult,
  PRWebhookPayload,
  ReviewConfig,
  ReviewFinding,
} from '../github-app';

// ─── Helpers ────────────────────────────────────────────────

function makePayload(overrides?: Partial<PRWebhookPayload>): PRWebhookPayload {
  return {
    action: 'opened',
    pullRequest: {
      number: 42,
      title: 'Add auth feature',
      author: 'dev',
      headSha: 'abc123',
      baseBranch: 'main',
      headBranch: 'feature/auth',
      url: 'https://github.com/org/repo/pull/42',
    },
    repository: {
      owner: 'org',
      name: 'repo',
      fullName: 'org/repo',
      cloneUrl: 'https://github.com/org/repo.git',
      defaultBranch: 'main',
    },
    ...overrides,
  };
}

function makePipelineResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    score: 75,
    findings: [],
    recommendations: [],
    duration: 3000,
    ...overrides,
  };
}

function makeFinding(severity: ReviewFinding['severity'] = 'high'): ReviewFinding {
  return {
    id: `f-${Math.random().toString(36).slice(2, 6)}`,
    title: `Test ${severity} finding`,
    severity,
    file: 'src/service.ts',
    line: 42,
    description: 'Test description',
    recommendation: 'Fix it',
  };
}

function makeGit(): GitAdapter & { cloneCalls: string[]; cleanupCalls: string[] } {
  return {
    cloneCalls: [],
    cleanupCalls: [],
    clone: async function(url, path, branch) { this.cloneCalls.push(`${url}:${branch}`); },
    cleanup: async function(path) { this.cleanupCalls.push(path); },
  };
}

function makeGitHub(): GitHubAdapter & {
  comments: { pr: number; body: string }[];
  labels: { pr: number; label: string; action: string }[];
  checks: { sha: string; conclusion: string }[];
} {
  return {
    comments: [],
    labels: [],
    checks: [],
    postComment: async function(owner, repo, pr, body) {
      this.comments.push({ pr, body });
    },
    addLabel: async function(owner, repo, pr, label) {
      this.labels.push({ pr, label, action: 'add' });
    },
    removeLabel: async function(owner, repo, pr, label) {
      this.labels.push({ pr, label, action: 'remove' });
    },
    createCheckRun: async function(owner, repo, sha, name, status, conclusion, summary) {
      this.checks.push({ sha, conclusion });
    },
  };
}

function makePipeline(result: PipelineResult): PipelineRunner {
  return { run: async () => result };
}

// ─── CommentFormatter Tests ─────────────────────────────────

describe('CommentFormatter', () => {
  const defaultConfig: Required<ReviewConfig> = {
    minScore: 60,
    maxCritical: 0,
    inlineComments: true,
    failLabel: 'needs-review',
    passLabel: 'arch-ok',
  };

  it('should format passing review', () => {
    const result = makePipelineResult({ score: 80 });
    const comment = CommentFormatter.format(result, defaultConfig);

    expect(comment.passed).toBe(true);
    expect(comment.body).toContain('PASSED');
    expect(comment.body).toContain('80/100');
    expect(comment.score).toBe(80);
  });

  it('should format failing review (low score)', () => {
    const result = makePipelineResult({ score: 50 });
    const comment = CommentFormatter.format(result, defaultConfig);

    expect(comment.passed).toBe(false);
    expect(comment.body).toContain('NEEDS ATTENTION');
  });

  it('should format failing review (critical findings)', () => {
    const result = makePipelineResult({
      score: 75,
      findings: [makeFinding('critical')],
    });
    const comment = CommentFormatter.format(result, defaultConfig);

    expect(comment.passed).toBe(false);
    expect(comment.criticalCount).toBe(1);
  });

  it('should include findings table', () => {
    const result = makePipelineResult({
      findings: [
        makeFinding('critical'),
        makeFinding('high'),
        makeFinding('medium'),
        makeFinding('low'),
      ],
    });
    const comment = CommentFormatter.format(result, defaultConfig);

    expect(comment.body).toContain('Critical');
    expect(comment.body).toContain('High');
    expect(comment.body).toContain('Medium');
    expect(comment.body).toContain('Low');
    expect(comment.findingsCount).toBe(4);
  });

  it('should include recommendations', () => {
    const result = makePipelineResult({
      recommendations: ['Add tests', 'Reduce complexity'],
    });
    const comment = CommentFormatter.format(result, defaultConfig);

    expect(comment.body).toContain('Recommendations');
    expect(comment.body).toContain('Add tests');
  });

  it('should include score bar', () => {
    const result = makePipelineResult({ score: 80 });
    const comment = CommentFormatter.format(result, defaultConfig);
    expect(comment.body).toContain('█');
    expect(comment.body).toContain('80%');
  });

  it('should limit findings to 10', () => {
    const findings = Array.from({ length: 15 }, () => makeFinding('high'));
    const result = makePipelineResult({ findings });
    const comment = CommentFormatter.format(result, defaultConfig);

    // Count finding entries (lines starting with "- 🟠")
    const findingLines = comment.body.split('\n').filter(l => l.startsWith('- 🟠'));
    expect(findingLines.length).toBeLessThanOrEqual(10);
  });

  it('should include footer', () => {
    const result = makePipelineResult();
    const comment = CommentFormatter.format(result, defaultConfig);
    expect(comment.body).toContain('Nexus');
    expect(comment.body).toContain('Autonomous Engineering Intelligence');
  });
});

// ─── NexusReviewHandler Tests ───────────────────────────────

describe('NexusReviewHandler', () => {
  it('should clone, run pipeline, post comment, and cleanup', async () => {
    const git = makeGit();
    const github = makeGitHub();
    const pipeline = makePipeline(makePipelineResult({ score: 80 }));

    const handler = new NexusReviewHandler(git, github, pipeline);
    const comment = await handler.handlePullRequest(makePayload());

    expect(git.cloneCalls.length).toBe(1);
    expect(git.cloneCalls[0]).toContain('feature/auth');
    expect(github.comments.length).toBe(1);
    expect(github.comments[0].pr).toBe(42);
    expect(comment.passed).toBe(true);
    expect(git.cleanupCalls.length).toBe(1);
  });

  it('should create success check run on pass', async () => {
    const github = makeGitHub();
    const handler = new NexusReviewHandler(
      makeGit(), github,
      makePipeline(makePipelineResult({ score: 80 })),
    );

    await handler.handlePullRequest(makePayload());
    expect(github.checks[0].conclusion).toBe('success');
    expect(github.checks[0].sha).toBe('abc123');
  });

  it('should create failure check run on fail', async () => {
    const github = makeGitHub();
    const handler = new NexusReviewHandler(
      makeGit(), github,
      makePipeline(makePipelineResult({ score: 40 })),
    );

    await handler.handlePullRequest(makePayload());
    expect(github.checks[0].conclusion).toBe('failure');
  });

  it('should add pass label and remove fail label on pass', async () => {
    const github = makeGitHub();
    const handler = new NexusReviewHandler(
      makeGit(), github,
      makePipeline(makePipelineResult({ score: 80 })),
    );

    await handler.handlePullRequest(makePayload());

    const addedLabels = github.labels.filter(l => l.action === 'add');
    expect(addedLabels.some(l => l.label === 'architecture-ok')).toBe(true);
  });

  it('should add fail label on failure', async () => {
    const github = makeGitHub();
    const handler = new NexusReviewHandler(
      makeGit(), github,
      makePipeline(makePipelineResult({ score: 40 })),
    );

    await handler.handlePullRequest(makePayload());

    const addedLabels = github.labels.filter(l => l.action === 'add');
    expect(addedLabels.some(l => l.label === 'needs-architecture-review')).toBe(true);
  });

  it('should cleanup even on pipeline failure', async () => {
    const git = makeGit();
    const failingPipeline: PipelineRunner = {
      run: async () => { throw new Error('Pipeline crashed'); },
    };

    const handler = new NexusReviewHandler(makeGit(), makeGitHub(), failingPipeline);
    // Use a fresh git with separate tracking
    const handler2 = new NexusReviewHandler(git, makeGitHub(), failingPipeline);

    await expect(handler2.handlePullRequest(makePayload())).rejects.toThrow('Pipeline crashed');
    expect(git.cleanupCalls.length).toBe(1);
  });

  it('should use custom config', async () => {
    const github = makeGitHub();
    const handler = new NexusReviewHandler(
      makeGit(), github,
      makePipeline(makePipelineResult({ score: 75 })),
      { minScore: 80 }, // stricter threshold
    );

    const comment = await handler.handlePullRequest(makePayload());
    expect(comment.passed).toBe(false); // 75 < 80
  });
});
