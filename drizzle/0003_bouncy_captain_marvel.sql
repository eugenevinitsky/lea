CREATE TABLE "authorized_users" (
	"did" varchar(255) PRIMARY KEY NOT NULL,
	"handle" varchar(255),
	"authorized_at" timestamp DEFAULT now() NOT NULL,
	"invite_code_used" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"code" varchar(50) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(255),
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "poll_participants" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"poll_id" varchar(50) NOT NULL,
	"voter_hash" varchar(64) NOT NULL,
	"voted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "poll_votes_voter_idx";--> statement-breakpoint
CREATE INDEX "authorized_users_handle_idx" ON "authorized_users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "poll_participants_poll_idx" ON "poll_participants" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_participants_hash_idx" ON "poll_participants" USING btree ("voter_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_participants_unique_vote" ON "poll_participants" USING btree ("poll_id","voter_hash");--> statement-breakpoint
ALTER TABLE "poll_votes" DROP COLUMN "voter_did";