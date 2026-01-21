CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_id" varchar(255),
	"target_id" varchar(255),
	"target_type" varchar(50),
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "established_venues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(500) NOT NULL,
	"openalex_source_id" varchar(100),
	"issn" varchar(20),
	"venue_type" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "established_venues_openalex_source_id_unique" UNIQUE("openalex_source_id")
);
--> statement-breakpoint
CREATE TABLE "verified_organizations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"did" varchar(255) NOT NULL,
	"handle" varchar(255),
	"organization_type" varchar(50) NOT NULL,
	"organization_name" varchar(255) NOT NULL,
	"website" varchar(500),
	"label_applied" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"verified_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verified_organizations_did_unique" UNIQUE("did")
);
--> statement-breakpoint
ALTER TABLE "verified_researchers" ALTER COLUMN "orcid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verified_researchers" ADD COLUMN "website" varchar(500);--> statement-breakpoint
ALTER TABLE "verified_researchers" ADD COLUMN "verified_by" varchar(255);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "established_venues_openalex_idx" ON "established_venues" USING btree ("openalex_source_id");--> statement-breakpoint
CREATE INDEX "established_venues_name_idx" ON "established_venues" USING btree ("name");--> statement-breakpoint
CREATE INDEX "verified_organizations_type_idx" ON "verified_organizations" USING btree ("organization_type");