import "./envConfig";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __pagesCmsPostgresClient: ReturnType<typeof postgres> | undefined;
}

// In serverless environments a module instance can be reused across warm
// invocations, so keep the pool on globalThis instead of recreating sockets.
const maxConnections = parseInt(
  process.env.POSTGRES_MAX_CONNECTIONS ||
    (process.env.NODE_ENV === "production" ? "3" : "5"),
  10,
);

const client =
  globalThis.__pagesCmsPostgresClient ??
  postgres(process.env.DATABASE_URL!, {
    max: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
  });

globalThis.__pagesCmsPostgresClient = client;

export const db = drizzle(client, { schema });
