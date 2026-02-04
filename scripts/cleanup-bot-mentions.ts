/**
 * Remove existing mentions from blacklisted bots
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, paperMentions, substackMentions, articleMentions, discoveredPapers, discoveredSubstackPosts, discoveredArticles, botAccounts } from '@/lib/db';
import { inArray, sql, eq } from 'drizzle-orm';

async function main() {
  // Load bot DIDs from database
  const bots = await db.select({ did: botAccounts.did }).from(botAccounts);
  const botDids = bots.map(b => b.did);
  console.log(`Cleaning up mentions from ${botDids.length} blacklisted bots...\n`);

  if (botDids.length === 0) {
    console.log('No bots in database. Nothing to clean up.');
    process.exit(0);
  }

  // Count existing bot mentions
  const paperBotMentions = await db
    .select({ count: sql<number>`count(*)` })
    .from(paperMentions)
    .where(inArray(paperMentions.authorDid, botDids));

  const substackBotMentions = await db
    .select({ count: sql<number>`count(*)` })
    .from(substackMentions)
    .where(inArray(substackMentions.authorDid, botDids));

  const articleBotMentions = await db
    .select({ count: sql<number>`count(*)` })
    .from(articleMentions)
    .where(inArray(articleMentions.authorDid, botDids));

  console.log('Bot mentions found:');
  console.log(`  Papers: ${paperBotMentions[0].count}`);
  console.log(`  Substack: ${substackBotMentions[0].count}`);
  console.log(`  Articles: ${articleBotMentions[0].count}`);
  console.log(`  Total: ${Number(paperBotMentions[0].count) + Number(substackBotMentions[0].count) + Number(articleBotMentions[0].count)}`);

  // Delete bot mentions and update mention counts
  console.log('\nDeleting bot mentions...');

  // For papers - get affected paper IDs first
  const affectedPapers = await db
    .selectDistinct({ paperId: paperMentions.paperId })
    .from(paperMentions)
    .where(inArray(paperMentions.authorDid, botDids));

  console.log(`  Affected papers: ${affectedPapers.length}`);

  // Delete paper mentions from bots
  const deletedPaperMentions = await db
    .delete(paperMentions)
    .where(inArray(paperMentions.authorDid, botDids))
    .returning({ id: paperMentions.id });

  console.log(`  Deleted ${deletedPaperMentions.length} paper mentions`);

  // Update mention counts for affected papers
  for (const { paperId } of affectedPapers) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(paperMentions)
      .where(eq(paperMentions.paperId, paperId));

    await db
      .update(discoveredPapers)
      .set({ mentionCount: countResult.count })
      .where(eq(discoveredPapers.id, paperId));
  }
  console.log(`  Updated mention counts for ${affectedPapers.length} papers`);

  // For substack - get affected post IDs first
  const affectedSubstackPosts = await db
    .selectDistinct({ substackPostId: substackMentions.substackPostId })
    .from(substackMentions)
    .where(inArray(substackMentions.authorDid, botDids));

  console.log(`  Affected substack posts: ${affectedSubstackPosts.length}`);

  // Delete substack mentions from bots
  const deletedSubstackMentions = await db
    .delete(substackMentions)
    .where(inArray(substackMentions.authorDid, botDids))
    .returning({ id: substackMentions.id });

  console.log(`  Deleted ${deletedSubstackMentions.length} substack mentions`);

  // Update mention counts for affected substack posts
  for (const { substackPostId } of affectedSubstackPosts) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(substackMentions)
      .where(eq(substackMentions.substackPostId, substackPostId));

    await db
      .update(discoveredSubstackPosts)
      .set({ mentionCount: countResult.count })
      .where(eq(discoveredSubstackPosts.id, substackPostId));
  }
  console.log(`  Updated mention counts for ${affectedSubstackPosts.length} substack posts`);

  // For articles - get affected article IDs first
  const affectedArticles = await db
    .selectDistinct({ articleId: articleMentions.articleId })
    .from(articleMentions)
    .where(inArray(articleMentions.authorDid, botDids));

  console.log(`  Affected articles: ${affectedArticles.length}`);

  // Delete article mentions from bots
  const deletedArticleMentions = await db
    .delete(articleMentions)
    .where(inArray(articleMentions.authorDid, botDids))
    .returning({ id: articleMentions.id });

  console.log(`  Deleted ${deletedArticleMentions.length} article mentions`);

  // Update mention counts for affected articles
  for (const { articleId } of affectedArticles) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articleMentions)
      .where(eq(articleMentions.articleId, articleId));

    await db
      .update(discoveredArticles)
      .set({ mentionCount: countResult.count })
      .where(eq(discoveredArticles.id, articleId));
  }
  console.log(`  Updated mention counts for ${affectedArticles.length} articles`);

  console.log('\nDone!');
  process.exit(0);
}

main().catch(console.error);
