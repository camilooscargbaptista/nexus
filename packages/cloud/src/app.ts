/**
 * Nexus Cloud — Express application factory
 *
 * Composition root: all dependencies are wired here.
 * No service knows about concrete implementations — only interfaces.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";

import { AppConfig } from "./config.js";
import { AuthMiddleware } from "./middleware/auth.js";
import { AuditMiddleware, AuditStore } from "./middleware/audit.js";
import { errorHandler } from "./middleware/error-handler.js";

import { AuthService, UserRepository } from "./services/auth-service.js";
import { ProjectService, ProjectRepository, RunRepository } from "./services/project-service.js";
import { TeamService, TeamRepository, MemberRepository } from "./services/team-service.js";

import { createAuthRoutes } from "./routes/auth-routes.js";
import { createProjectRoutes } from "./routes/project-routes.js";
import { createTeamRoutes } from "./routes/team-routes.js";
import { createHealthRoutes, HealthCheck } from "./routes/health-routes.js";
import { createPipelineRoutes, FindingRepository, PipelineEngine } from "./routes/pipeline-routes.js";

export interface Repositories {
  users: UserRepository;
  projects: ProjectRepository;
  runs: RunRepository;
  teams: TeamRepository;
  members: MemberRepository;
  audit: AuditStore;
  health: HealthCheck;
  findings: FindingRepository;
}

/** Pipeline engine — optional, enables /analyze endpoint */
export interface AppDeps {
  pipeline?: PipelineEngine;
}

/** Assembled services — exposed for testing */
export interface Services {
  auth: AuthService;
  projects: ProjectService;
  teams: TeamService;
}

export interface AppContext {
  app: Express;
  services: Services;
}

/**
 * Creates a fully-wired Express app.
 *
 * This is the composition root — the only place where concrete
 * implementations are connected to interfaces.
 */
export function createApp(config: AppConfig, repos: Repositories, deps?: AppDeps): AppContext {
  const app = express();

  // --- Global middleware ---
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.split(","), credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  // --- Request ID ---
  app.use((_req, res, next) => {
    res.setHeader("X-Request-Id", crypto.randomUUID());
    next();
  });

  // --- Wire services (DI composition) ---
  const authMw = new AuthMiddleware(config.jwtSecret);
  const auditMw = new AuditMiddleware(repos.audit);

  const authService = new AuthService(repos.users);
  const projectService = new ProjectService(repos.projects, repos.runs);
  const teamService = new TeamService(repos.teams, repos.members);

  // --- Mount routes ---
  app.use("/api", createHealthRoutes(repos.health));
  app.use("/api/auth", createAuthRoutes(authService, authMw));
  app.use("/api/projects", auditMw.log("project.access", "project"), createProjectRoutes(projectService, authMw));
  app.use("/api/teams", auditMw.log("team.access", "team"), createTeamRoutes(teamService, authMw));

  // Pipeline routes (optional — enabled when pipeline engine is provided)
  if (deps?.pipeline) {
    app.use("/api", createPipelineRoutes({
      pipeline: deps.pipeline,
      findings: repos.findings,
      runs: repos.runs,
      authMw,
    }));
  }

  // --- API info ---
  app.get("/api", (_req, res) => {
    res.json({
      name: "Nexus Cloud API",
      version: "1.0.0",
      description: "Autonomous Engineering Intelligence Platform",
      endpoints: {
        auth: "/api/auth",
        projects: "/api/projects",
        teams: "/api/teams",
        health: "/api/health",
      },
    });
  });

  // --- Error handler (must be last) ---
  app.use(errorHandler);

  return {
    app,
    services: { auth: authService, projects: projectService, teams: teamService },
  };
}
