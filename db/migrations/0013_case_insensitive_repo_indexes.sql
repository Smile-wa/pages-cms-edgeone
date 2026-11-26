CREATE INDEX IF NOT EXISTS "idx_config_owner_repo_branch_ci" ON "config" USING btree (lower("owner"), lower("repo"), "branch");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cache_file_meta_owner_repo_branch_ci" ON "cache_file_meta" USING btree (lower("owner"), lower("repo"), "branch");
