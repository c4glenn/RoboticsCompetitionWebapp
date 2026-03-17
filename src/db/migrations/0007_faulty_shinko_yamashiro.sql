ALTER TABLE "match_teams" ALTER COLUMN "side" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "match_sides" jsonb;--> statement-breakpoint
DROP TYPE "public"."match_side";