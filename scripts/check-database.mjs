#!/usr/bin/env node

/**
 * Verify that the database pointed to by DATABASE_URL has all tables the app
 * needs. Run this after `npm run db:migrate` with the SAME DATABASE_URL that
 * will be configured in EdgeOne Makers.
 */

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { default: postgres } = await import("postgres");

const requiredTables = [
	"user",
	"session",
	"account",
	"verification",
	"github_installation_token",
	"collaborator",
	"collaborator_invite",
	"config",
	"cache_file",
	"cache_file_meta",
	"cache_permission",
	"action_run",
];

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("Missing DATABASE_URL. Set it to the same value used in EdgeOne Makers.");
	process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 10 });

try {
	const rows = await sql`
		select table_name
		from information_schema.tables
		where table_schema = current_schema()
	`;
	const existing = new Set(rows.map((row) => row.table_name));
	const missing = requiredTables.filter((table) => !existing.has(table));

	if (missing.length > 0) {
		console.error(`Missing tables: ${missing.join(", ")}`);
		console.error("Run `npm run db:migrate` with this same DATABASE_URL, then re-check.");
		process.exitCode = 1;
	} else {
		console.log(`OK: all ${requiredTables.length} required tables exist.`);
	}
} catch (error) {
	console.error(`Could not query database: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	await sql.end();
}
