/**
 * @nexus/cloud — Configuration
 * Loads from environment with sensible defaults for development.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  databaseUrl: z.string().default("postgresql://localhost:5432/nexus"),
  jwtSecret: z.string().min(16).default("nexus-dev-secret-change-in-prod"),
  jwtExpiresIn: z.string().default("7d"),
  corsOrigins: z.string().default("http://localhost:3001"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    corsOrigins: process.env.CORS_ORIGINS,
    logLevel: process.env.LOG_LEVEL,
  });
}
