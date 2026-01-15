CREATE TABLE "article_mentions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "article_mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"article_id" integer NOT NULL,
	"post_uri" varchar(500) NOT NULL,
	"author_did" varchar(255) NOT NULL,
	"post_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_verified_researcher" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "discovered_articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discovered_articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"normalized_id" varchar(255) NOT NULL,
	"source" varchar(50) NOT NULL,
	"slug" varchar(500),
	"title" text,
	"description" text,
	"author" varchar(255),
	"image_url" text,
	"category" varchar(100),
	"published_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "discovered_articles_normalized_id_unique" UNIQUE("normalized_id")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"poll_id" varchar(50) NOT NULL,
	"voter_did" varchar(255) NOT NULL,
	"option_id" varchar(50) NOT NULL,
	"voted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"post_uri" varchar(500) NOT NULL,
	"creator_did" varchar(255) NOT NULL,
	"question" text,
	"options" text NOT NULL,
	"ends_at" timestamp,
	"allow_multiple" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "polls_post_uri_unique" UNIQUE("post_uri")
);
--> statement-breakpoint
CREATE INDEX "article_mentions_article_idx" ON "article_mentions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_mentions_author_idx" ON "article_mentions" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "article_mentions_created_idx" ON "article_mentions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "article_mentions_verified_idx" ON "article_mentions" USING btree ("is_verified_researcher");--> statement-breakpoint
CREATE INDEX "article_mentions_post_uri_idx" ON "article_mentions" USING btree ("post_uri");--> statement-breakpoint
CREATE INDEX "discovered_articles_source_idx" ON "discovered_articles" USING btree ("source");--> statement-breakpoint
CREATE INDEX "discovered_articles_last_seen_idx" ON "discovered_articles" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "discovered_articles_mention_count_idx" ON "discovered_articles" USING btree ("mention_count");--> statement-breakpoint
CREATE INDEX "poll_votes_poll_idx" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_votes_voter_idx" ON "poll_votes" USING btree ("voter_did");--> statement-breakpoint
CREATE INDEX "polls_post_uri_idx" ON "polls" USING btree ("post_uri");--> statement-breakpoint
CREATE INDEX "polls_creator_idx" ON "polls" USING btree ("creator_did");--> statement-breakpoint
CREATE INDEX "paper_mentions_post_uri_idx" ON "paper_mentions" USING btree ("post_uri");--> statement-breakpoint
CREATE INDEX "substack_mentions_post_uri_idx" ON "substack_mentions" USING btree ("post_uri");