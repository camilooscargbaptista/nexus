/**
 * Pipeline Routes — Sprint 16 Integration Proof
 *
 * Triggers NexusPipeline analysis, persists results to DB,
 * and exposes finding queries for the dashboard.
 *
 * Endpoints:
 *   POST /api/projects/:id/analyze     — trigger pipeline run
 *   GET  /api/projects/:id/findings/by-category — findings grouped
 *   GET  /api/runs/:runId/findings     — findings for a specific run
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

// ═══════════════════════════════════════════════════════════════
// INTERFACES — decoupled from concrete implementations
// ═══════════════════════════════════════════════════════════════

/** Finding record as stored in DB */
export interface FindingRecord {
  id: string;
  runId: string;
  layer: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string | null;
  line?: number | null;
  confidence: number;
  suggestion?: string | null;
  metadata: Record<string, unknown>;
  dismissed: boolean;
  createdAt: Date;
}

/** Repository for finding persistence */
export interface FindingRepository {
  createMany(findings: Omit<FindingRecord, "id" | "createdAt">[]): Promise<number>;
  findByRun(runId: string): Promise<FindingRecord[]>;
  findByProject(projectId: string, opts?: { days?: number }): Promise<FindingRecord[]>;
  countByCategory(projectId: string, opts?: { days?: number }): Promise<CategoryCount[]>;
}

export interface CategoryCount {
  category: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/** Pipeline engine — abstracted to avoid coupling to bridge package */
export interface PipelineEngine {
  run(projectPath?: string): Promise<PipelineResult>;
}

export interface PipelineResult {
  pipelineId: string;
  overallScore: number;
  scores: { perception: number; reasoning: number; validation: number };
  qualityGate: string;
  insights: PipelineInsight[];
  durationMs: number;
}

export interface PipelineInsight {
  layer: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  confidence: number;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

/** Run repository — reused from project-service */
export interface RunUpdater {
  create(data: {
    projectId: string;
    triggeredBy: string;
    branch?: string;
  }): Promise<{ id: string; status: string }>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY FINDING REPOSITORY (fallback — same pattern as Sprint 15)
// ═══════════════════════════════════════════════════════════════

export class InMemoryFindingRepository implements FindingRepository {
  private findings: FindingRecord[] = [];
  private counter = 0;

  async createMany(findings: Omit<FindingRecord, "id" | "createdAt">[]): Promise<number> {
    const records = findings.map((f) => ({
      ...f,
      id: `finding-${++this.counter}`,
      createdAt: new Date(),
    }));
    this.findings.push(...records);
    return records.length;
  }

  async findByRun(runId: string): Promise<FindingRecord[]> {
    return this.findings.filter((f) => f.runId === runId);
  }

  async findByProject(projectId: string, _opts?: { days?: number }): Promise<FindingRecord[]> {
    // In-memory: projectId filtering not possible without runs table, return all
    return this.findings;
  }

  async countByCategory(_projectId: string, _opts?: { days?: number }): Promise<CategoryCount[]> {
    const groups = new Map<string, CategoryCount>();
    for (const f of this.findings) {
      if (!groups.has(f.category)) {
        groups.set(f.category, { category: f.category, critical: 0, high: 0, medium: 0, low: 0, info: 0 });
      }
      const g = groups.get(f.category)!;
      const sev = f.severity as keyof Omit<CategoryCount, "category">;
      if (sev in g) g[sev]++;
    }
    return Array.from(groups.values());
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTE FACTORY
// ═══════════════════════════════════════════════════════════════

const analyzeSchema = z.object({
  branch: z.string().optional(),
  projectPath: z.string().optional(),
});

export interface PipelineRouteDeps {
  pipeline: PipelineEngine;
  findings: FindingRepository;
  runs: RunUpdater;
  authMw: AuthMiddleware;
}

export function createPipelineRoutes(deps: PipelineRouteDeps): Router {
  const { pipeline, findings, runs, authMw } = deps;
  const router = Router();

  // All pipeline routes require auth
  router.use(authMw.requireAuth);

  // ─── POST /projects/:id/analyze — Trigger pipeline ───
  router.post(
    "/projects/:id/analyze",
    validate(analyzeSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const projectId = req.params.id;
        const userId = req.user!.userId;
        const branch = req.body.branch;
        const projectPath = req.body.projectPath;

        // 1. Create a new pipeline run (status: RUNNING)
        const run = await runs.create({
          projectId,
          triggeredBy: userId,
          branch,
        });

        // Update status to RUNNING
        await runs.update(run.id, { status: "RUNNING" });

        // 2. Execute the pipeline
        const startTime = Date.now();
        let result: PipelineResult;

        try {
          result = await pipeline.run(projectPath);
        } catch (pipeErr) {
          // Pipeline failed — mark run as FAILED
          const durationMs = Date.now() - startTime;
          await runs.update(run.id, {
            status: "FAILED",
            durationMs,
            completedAt: new Date(),
          });
          throw pipeErr;
        }

        // 3. Persist findings
        if (result.insights.length > 0) {
          await findings.createMany(
            result.insights.map((insight) => ({
              runId: run.id,
              layer: insight.layer,
              category: insight.category,
              severity: insight.severity,
              title: insight.title,
              description: insight.description,
              filePath: insight.filePath ?? null,
              line: insight.line ?? null,
              confidence: insight.confidence,
              suggestion: insight.suggestion ?? null,
              metadata: insight.metadata ?? {},
              dismissed: false,
            }))
          );
        }

        // 4. Complete the run with results
        const criticalCount = result.insights.filter((i) => i.severity === "critical").length;
        await runs.update(run.id, {
          status: "COMPLETED",
          architectureScore: result.scores.perception,
          securityScore: result.scores.validation,
          qualityGate: result.qualityGate,
          findingsCount: result.insights.length,
          criticalCount,
          durationMs: result.durationMs,
          completedAt: new Date(),
        });

        // 5. Return result to caller
        res.status(201).json({
          runId: run.id,
          pipelineId: result.pipelineId,
          overallScore: result.overallScore,
          scores: result.scores,
          qualityGate: result.qualityGate,
          findingsCount: result.insights.length,
          criticalCount,
          durationMs: result.durationMs,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── GET /runs/:runId/findings — Findings for a run ───
  router.get(
    "/runs/:runId/findings",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const runFindings = await findings.findByRun(req.params.runId);
        res.json({ findings: runFindings });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── GET /projects/:id/findings/by-category — Aggregated ───
  router.get(
    "/projects/:id/findings/by-category",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const days = parseInt(req.query.days as string) || 30;
        const categories = await findings.countByCategory(req.params.id, { days });
        res.json({ categories });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
