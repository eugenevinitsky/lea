ALTER TABLE "discovered_articles" ADD COLUMN "trending_score_1h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_articles" ADD COLUMN "trending_score_6h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_articles" ADD COLUMN "trending_score_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_articles" ADD COLUMN "trending_score_7d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_articles" ADD COLUMN "trending_score_all_time" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_articles" ADD COLUMN "last_score_update" timestamp;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "trending_score_1h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "trending_score_6h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "trending_score_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "trending_score_7d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "trending_score_all_time" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_papers" ADD COLUMN "last_score_update" timestamp;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "trending_score_1h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "trending_score_6h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "trending_score_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "trending_score_7d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "trending_score_all_time" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_substack_posts" ADD COLUMN "last_score_update" timestamp;--> statement-breakpoint
CREATE INDEX "idx_articles_trending_1h" ON "discovered_articles" USING btree ("trending_score_1h");--> statement-breakpoint
CREATE INDEX "idx_articles_trending_6h" ON "discovered_articles" USING btree ("trending_score_6h");--> statement-breakpoint
CREATE INDEX "idx_articles_trending_24h" ON "discovered_articles" USING btree ("trending_score_24h");--> statement-breakpoint
CREATE INDEX "idx_articles_trending_7d" ON "discovered_articles" USING btree ("trending_score_7d");--> statement-breakpoint
CREATE INDEX "idx_papers_trending_1h" ON "discovered_papers" USING btree ("trending_score_1h");--> statement-breakpoint
CREATE INDEX "idx_papers_trending_6h" ON "discovered_papers" USING btree ("trending_score_6h");--> statement-breakpoint
CREATE INDEX "idx_papers_trending_24h" ON "discovered_papers" USING btree ("trending_score_24h");--> statement-breakpoint
CREATE INDEX "idx_papers_trending_7d" ON "discovered_papers" USING btree ("trending_score_7d");--> statement-breakpoint
CREATE INDEX "idx_substack_trending_1h" ON "discovered_substack_posts" USING btree ("trending_score_1h");--> statement-breakpoint
CREATE INDEX "idx_substack_trending_6h" ON "discovered_substack_posts" USING btree ("trending_score_6h");--> statement-breakpoint
CREATE INDEX "idx_substack_trending_24h" ON "discovered_substack_posts" USING btree ("trending_score_24h");--> statement-breakpoint
CREATE INDEX "idx_substack_trending_7d" ON "discovered_substack_posts" USING btree ("trending_score_7d");