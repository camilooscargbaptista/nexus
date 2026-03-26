/**
 * Health check and system info routes
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router } from "express";

export interface HealthCheck {
  checkDatabase(): Promise<boolean>;
}

export function createHealthRoutes(health: HealthCheck): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    try {
      const dbOk = await health.checkDatabase();
      const status = dbOk ? "healthy" : "degraded";
      res.status(dbOk ? 200 : 503).json({
        status,
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        services: {
          database: dbOk ? "connected" : "disconnected",
          api: "running",
        },
      });
    } catch {
      res.status(503).json({
        status: "unhealthy",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.get("/health/ready", (_req, res) => {
    res.json({ ready: true });
  });

  return router;
}
