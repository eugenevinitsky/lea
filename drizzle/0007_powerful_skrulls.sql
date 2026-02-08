CREATE TABLE "community_note_disputes" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"dispute_note_id" varchar(50) NOT NULL,
	"target_note_id" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_note_label_log" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"note_id" varchar(50) NOT NULL,
	"action" varchar(20),
	"label_val" varchar(50),
	"success" boolean,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_note_ratings" ADD COLUMN "aid" varchar(40);--> statement-breakpoint
ALTER TABLE "community_note_ratings" ADD COLUMN "ocn_value" integer;--> statement-breakpoint
ALTER TABLE "community_note_ratings" ADD COLUMN "reasons" text;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "aid" varchar(40);--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "reasons" text;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "target_type" varchar(20) DEFAULT 'post';--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "label_uri" varchar(500);--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "label_published_at" timestamp;--> statement-breakpoint
ALTER TABLE "community_notes" ADD COLUMN "label_status" varchar(20) DEFAULT 'none';--> statement-breakpoint
CREATE INDEX "community_note_disputes_target_idx" ON "community_note_disputes" USING btree ("target_note_id");--> statement-breakpoint
CREATE INDEX "community_note_disputes_dispute_idx" ON "community_note_disputes" USING btree ("dispute_note_id");--> statement-breakpoint
CREATE INDEX "community_note_label_log_note_idx" ON "community_note_label_log" USING btree ("note_id");