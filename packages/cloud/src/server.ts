/**
 * Nexus Cloud — Standalone server
 *
 * Usage: node dist/server.js
 * Requires JWT_SECRET env var (DATABASE_URL optional — falls back to in-memory).
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { createInMemoryRepositories } from "./repositories/in-memory.js";
import type { Repositories } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();

  let repos: Repositories;
  let disconnect: (() => Promise<void>) | undefined;

  // Tentar conectar Prisma se DATABASE_URL estiver definida
  if (config.databaseUrl && !config.databaseUrl.includes("localhost:5432/nexus")) {
    try {
      const { createPrismaRepositories } = await import("./repositories/prisma.js");
      const prisma = await createPrismaRepositories(config.databaseUrl);
      repos = prisma.repos;
      disconnect = prisma.disconnect;
      console.log("[Nexus Cloud] ✅ Connected to PostgreSQL");
    } catch (err) {
      console.warn("[Nexus Cloud] ⚠️ Prisma connection failed, falling back to in-memory:", err instanceof Error ? err.message : err);
      repos = createInMemoryRepositories();
    }
  } else {
    repos = createInMemoryRepositories();
    console.log("[Nexus Cloud] 📦 Using in-memory repositories (set DATABASE_URL for persistence)");
  }

  const { app } = createApp(config, repos);

  const server = app.listen(config.port, () => {
    console.log(`[Nexus Cloud] API running on port ${config.port} (${config.nodeEnv})`);
    console.log(`[Nexus Cloud] Health: http://localhost:${config.port}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Nexus Cloud] ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      if (disconnect) {
        await disconnect();
        console.log("[Nexus Cloud] Database disconnected.");
      }
      console.log("[Nexus Cloud] Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Nexus Cloud] Failed to start:", err);
  process.exit(1);
});
