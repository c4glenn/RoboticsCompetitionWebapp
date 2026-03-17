ALTER TABLE "tournaments" ADD COLUMN "matches_per_team" integer NOT NULL DEFAULT 3;
ALTER TABLE "tournaments" ADD COLUMN "score_aggregation" jsonb NOT NULL DEFAULT '{"method":"best_n","n":2}'::jsonb;
