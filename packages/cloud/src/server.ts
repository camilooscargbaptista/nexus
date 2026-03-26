/**
 * Nexus Cloud — Standalone server
 *
 * Usage: node dist/server.js
 * Requires DATABASE_URL and JWT_SECRET env vars.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { createInMemoryRepositories } from "./repositories/in-memory.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // In production, replace with Prisma repositories
  // import { createPrismaRepositories } from "./repositories/prisma.js";
  // const repos = await createPrismaRepositories(config.databaseUrl);
  const repos = createInMemoryRepositories();

  const { app } = createApp(config, repos);

  app.listen(config.port, () => {
    console.log(`[Nexus Cloud] API running on port ${config.port} (${config.nodeEnv})`);
    console.log(`[Nexus Cloud] Health: http://localhost:${config.port}/api/health`);
  });
}

main().catch((err) => {
  console.error("[Nexus Cloud] Failed to start:", err);
  process.exit(1);
});
