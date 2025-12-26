CREATE TABLE "bluesky_lists" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_did" varchar(255) NOT NULL,
	"list_uri" varchar(500) NOT NULL,
	"list_cid" varchar(100),
	"name" varchar(255) NOT NULL,
	"purpose" varchar(100) NOT NULL,
	"member_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bluesky_lists_list_uri_unique" UNIQUE("list_uri")
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"did" varchar(255) NOT NULL,
	"handle" varchar(255),
	"hop_distance" integer NOT NULL,
	"closest_verified_did" varchar(255),
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"added_to_list_at" timestamp,
	"list_item_uri" varchar(500),
	CONSTRAINT "community_members_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "social_graph" (
	"follower_id" varchar(255) NOT NULL,
	"following_id" varchar(255) NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_verified" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_graph_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"cursor" varchar(500),
	"last_sync_at" timestamp,
	"status" varchar(20) DEFAULT 'idle',
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "verified_researchers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"did" varchar(255) NOT NULL,
	"handle" varchar(255),
	"orcid" varchar(19) NOT NULL,
	"name" varchar(255),
	"institution" varchar(500),
	"research_topics" text,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"verification_method" varchar(50) NOT NULL,
	"vouched_by" varchar(36),
	"is_active" boolean DEFAULT true NOT NULL,
	"personal_list_uri" varchar(500),
	"personal_list_synced_at" timestamp,
	CONSTRAINT "verified_researchers_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "vouch_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"requester_did" varchar(255) NOT NULL,
	"requester_handle" varchar(255),
	"voucher_did" varchar(255) NOT NULL,
	"message" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "community_members_did_idx" ON "community_members" USING btree ("did");--> statement-breakpoint
CREATE INDEX "community_members_hop_idx" ON "community_members" USING btree ("hop_distance");--> statement-breakpoint
CREATE INDEX "social_graph_follower_idx" ON "social_graph" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "social_graph_following_idx" ON "social_graph" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "verified_researchers_did_idx" ON "verified_researchers" USING btree ("did");--> statement-breakpoint
CREATE INDEX "verified_researchers_orcid_idx" ON "verified_researchers" USING btree ("orcid");--> statement-breakpoint
CREATE INDEX "vouch_requests_requester_idx" ON "vouch_requests" USING btree ("requester_did");--> statement-breakpoint
CREATE INDEX "vouch_requests_voucher_idx" ON "vouch_requests" USING btree ("voucher_did");