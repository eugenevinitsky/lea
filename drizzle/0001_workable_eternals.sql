CREATE TABLE "discovered_papers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discovered_papers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"normalized_id" varchar(255) NOT NULL,
	"source" varchar(50) NOT NULL,
	"title" text,
	"authors" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "discovered_papers_normalized_id_unique" UNIQUE("normalized_id")
);
--> statement-breakpoint
CREATE TABLE "discovered_substack_posts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discovered_substack_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"normalized_id" varchar(255) NOT NULL,
	"subdomain" varchar(100) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" text,
	"description" text,
	"author" varchar(255),
	"newsletter_name" varchar(255),
	"image_url" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "discovered_substack_posts_normalized_id_unique" UNIQUE("normalized_id")
);
--> statement-breakpoint
CREATE TABLE "paper_mentions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"paper_id" integer NOT NULL,
	"post_uri" varchar(500) NOT NULL,
	"author_did" varchar(255) NOT NULL,
	"author_handle" varchar(255),
	"post_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_verified_researcher" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "researcher_profiles" (
	"did" varchar(255) PRIMARY KEY NOT NULL,
	"short_bio" text,
	"affiliation" varchar(255),
	"disciplines" text,
	"links" text,
	"publication_venues" text,
	"favorite_own_papers" text,
	"favorite_read_papers" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substack_mentions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "substack_mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"substack_post_id" integer NOT NULL,
	"post_uri" varchar(500) NOT NULL,
	"author_did" varchar(255) NOT NULL,
	"author_handle" varchar(255),
	"post_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_verified_researcher" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "user_bookmark_collections" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"user_did" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bookmarks" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"user_did" varchar(255) NOT NULL,
	"post_uri" varchar(500) NOT NULL,
	"post_data" text NOT NULL,
	"collection_ids" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feeds" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"user_did" varchar(255) NOT NULL,
	"feed_uri" varchar(500) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"accepts_interactions" boolean DEFAULT false,
	"feed_type" varchar(20),
	"keyword" varchar(255),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_members" DROP CONSTRAINT "community_members_did_unique";--> statement-breakpoint
DROP INDEX "community_members_did_idx";--> statement-breakpoint
DROP INDEX "community_members_hop_idx";--> statement-breakpoint
ALTER TABLE "community_members" ALTER COLUMN "hop_distance" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ALTER COLUMN "computed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "community_members" ALTER COLUMN "computed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "added_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "verified_researchers" ADD COLUMN "open_alex_id" varchar(100);--> statement-breakpoint
CREATE INDEX "discovered_papers_source_idx" ON "discovered_papers" USING btree ("source");--> statement-breakpoint
CREATE INDEX "discovered_papers_last_seen_idx" ON "discovered_papers" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "discovered_papers_mention_count_idx" ON "discovered_papers" USING btree ("mention_count");--> statement-breakpoint
CREATE INDEX "discovered_substack_posts_subdomain_idx" ON "discovered_substack_posts" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "discovered_substack_posts_last_seen_idx" ON "discovered_substack_posts" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "discovered_substack_posts_mention_count_idx" ON "discovered_substack_posts" USING btree ("mention_count");--> statement-breakpoint
CREATE INDEX "paper_mentions_paper_idx" ON "paper_mentions" USING btree ("paper_id");--> statement-breakpoint
CREATE INDEX "paper_mentions_author_idx" ON "paper_mentions" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "paper_mentions_created_idx" ON "paper_mentions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "paper_mentions_verified_idx" ON "paper_mentions" USING btree ("is_verified_researcher");--> statement-breakpoint
CREATE INDEX "substack_mentions_post_idx" ON "substack_mentions" USING btree ("substack_post_id");--> statement-breakpoint
CREATE INDEX "substack_mentions_author_idx" ON "substack_mentions" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "substack_mentions_created_idx" ON "substack_mentions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "substack_mentions_verified_idx" ON "substack_mentions" USING btree ("is_verified_researcher");--> statement-breakpoint
CREATE INDEX "user_bookmark_collections_user_idx" ON "user_bookmark_collections" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "user_bookmarks_user_idx" ON "user_bookmarks" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "user_bookmarks_post_idx" ON "user_bookmarks" USING btree ("post_uri");--> statement-breakpoint
CREATE INDEX "user_feeds_user_idx" ON "user_feeds" USING btree ("user_did");