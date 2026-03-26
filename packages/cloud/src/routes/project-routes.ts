/**
 * Project & pipeline run routes
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router } from "express";
import { z } from "zod";
import { ProjectService } from "../services/project-service.js";
import { AuthMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().url().optional(),
  defaultBranch: z.string().default("main"),
});

const createRunSchema = z.object({
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
});

const completeRunSchema = z.object({
  architectureScore: z.number().min(0).max(100).optional(),
  securityScore: z.number().min(0).max(100).optional(),
  qualityGate: z.enum(["PASSED", "FAILED", "WARNING"]).optional(),
  findingsCount: z.number().int().min(0).optional(),
  criticalCount: z.number().int().min(0).optional(),
  durationMs: z.number().int().min(0).optional(),
  modelTier: z.string().optional(),
  tokensUsed: z.number().int().min(0).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createProjectRoutes(projects: ProjectService, authMw: AuthMiddleware): Router {
  const router = Router();

  // All routes require auth
  router.use(authMw.requireAuth);

  // --- Projects ---
  router.get("/", authMw.extractTeam, async (req: AuthenticatedRequest, res, next) => {
    try {
      const list = await projects.listProjects(req.teamId || "");
      res.json({ projects: list });
    } catch (err) { next(err); }
  });

  router.post("/", validate(createProjectSchema), async (req: AuthenticatedRequest, res, next) => {
    try {
      const project = await projects.createProject({
        ...req.body,
        teamId: req.teamId || req.headers["x-team-id"] as string || "",
      });
      res.status(201).json(project);
    } catch (err) { next(err); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const project = await projects.getProject(req.params.id);
      res.json(project);
    } catch (err) { next(err); }
  });

  router.get("/:id/stats", async (req, res, next) => {
    try {
      const stats = await projects.getProjectStats(req.params.id);
      res.json(stats);
    } catch (err) { next(err); }
  });

  // --- Runs ---
  router.get("/:id/runs", validate(paginationSchema, "query"), async (req, res, next) => {
    try {
      const runs = await projects.listRuns(req.params.id, req.query as any);
      res.json({ runs });
    } catch (err) { next(err); }
  });

  router.post("/:id/runs", validate(createRunSchema), async (req: AuthenticatedRequest, res, next) => {
    try {
      const run = await projects.createRun({
        ...req.body,
        projectId: req.params.id,
        triggeredBy: req.user!.userId,
      });
      res.status(201).json(run);
    } catch (err) { next(err); }
  });

  router.get("/runs/:runId", async (req, res, next) => {
    try {
      const run = await projects.getRun(req.params.runId);
      res.json(run);
    } catch (err) { next(err); }
  });

  router.patch("/runs/:runId/complete", validate(completeRunSchema), async (req, res, next) => {
    try {
      const run = await projects.completeRun(req.params.runId, req.body);
      res.json(run);
    } catch (err) { next(err); }
  });

  return router;
}
