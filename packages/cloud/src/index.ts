/**
 * Nexus Cloud — Barrel exports
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// App composition
export { createApp } from "./app.js";
export type { Repositories, Services, AppContext } from "./app.js";

// Config
export { loadConfig } from "./config.js";
export type { AppConfig } from "./config.js";

// Middleware
export { AuthMiddleware } from "./middleware/auth.js";
export type { JwtPayload, AuthenticatedRequest } from "./middleware/auth.js";
export { AppError, errorHandler } from "./middleware/error-handler.js";
export { AuditMiddleware } from "./middleware/audit.js";
export type { AuditStore, AuditEntry } from "./middleware/audit.js";
export { validate } from "./middleware/validate.js";

// Services
export { AuthService } from "./services/auth-service.js";
export type { UserRepository, UserRecord, RegisterInput, LoginInput } from "./services/auth-service.js";
export { ProjectService } from "./services/project-service.js";
export type { ProjectRepository, RunRepository, ProjectRecord, RunRecord, ProjectStats, CreateRunData } from "./services/project-service.js";
export { TeamService } from "./services/team-service.js";
export type { TeamRepository, MemberRepository, TeamRecord, MemberRecord, CreateTeamData } from "./services/team-service.js";

// Routes
export { createAuthRoutes } from "./routes/auth-routes.js";
export { createProjectRoutes } from "./routes/project-routes.js";
export { createTeamRoutes } from "./routes/team-routes.js";
export { createHealthRoutes } from "./routes/health-routes.js";
export type { HealthCheck } from "./routes/health-routes.js";

// Repositories
export { createInMemoryRepositories } from "./repositories/in-memory.js";
