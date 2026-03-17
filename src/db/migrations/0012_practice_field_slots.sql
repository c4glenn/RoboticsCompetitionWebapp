CREATE TABLE "practice_field_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"booked_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_field_slot" UNIQUE("field_id","start_time"),
	CONSTRAINT "uq_team_slot" UNIQUE("team_id","start_time")
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "practice_slot_duration_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "max_future_practice_slots" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_field_slots" ADD CONSTRAINT "practice_field_slots_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_field_slots" ADD CONSTRAINT "practice_field_slots_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_field_slots" ADD CONSTRAINT "practice_field_slots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_field_slots" ADD CONSTRAINT "practice_field_slots_booked_by_user_id_users_id_fk" FOREIGN KEY ("booked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;