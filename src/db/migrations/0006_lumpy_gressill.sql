ALTER TABLE "matches" DROP CONSTRAINT "matches_field_id_fields_id_fk";
--> statement-breakpoint
ALTER TABLE "match_teams" ADD COLUMN "field_id" uuid;--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN "field_id";