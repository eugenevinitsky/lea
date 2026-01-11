/**
 * Pull recent Substack posts from database for classification review
 *
 * Usage: npx tsx scripts/pull-substack-for-classification.ts [--limit N] [--days N]
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts } from '@/lib/db';
import { desc, gte } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { classifyContent } from '@/lib/substack-classifier';

interface PostForReview {
  id: number;
  title: string | null;
  description: string | null;
  subdomain: string;
  url: string;
  mentionCount: number;
  currentPrediction: string;
  scores: { technical: number; 'non-technical': number };
}

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  let limit = 100;
  let days = 7;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  console.log(`Pulling Substack posts from the last ${days} days (limit: ${limit})...`);

  const posts = await db
    .select({
      id: discoveredSubstackPosts.id,
      title: discoveredSubstackPosts.title,
      description: discoveredSubstackPosts.description,
      subdomain: discoveredSubstackPosts.subdomain,
      url: discoveredSubstackPosts.url,
      mentionCount: discoveredSubstackPosts.mentionCount,
      firstSeenAt: discoveredSubstackPosts.firstSeenAt,
    })
    .from(discoveredSubstackPosts)
    .where(gte(discoveredSubstackPosts.firstSeenAt, cutoffDate))
    .orderBy(desc(discoveredSubstackPosts.mentionCount))
    .limit(limit);

  console.log(`Found ${posts.length} posts\n`);

  const postsForReview: PostForReview[] = [];

  for (const post of posts) {
    const classification = classifyContent(post.title || '', post.description || '');

    postsForReview.push({
      id: post.id,
      title: post.title,
      description: post.description,
      subdomain: post.subdomain,
      url: post.url,
      mentionCount: post.mentionCount,
      currentPrediction: classification.prediction,
      scores: classification.scores as { technical: number; 'non-technical': number },
    });
  }

  // Output summary
  const technicalCount = postsForReview.filter(p => p.currentPrediction === 'technical').length;
  const nonTechnicalCount = postsForReview.filter(p => p.currentPrediction === 'non-technical').length;

  console.log(`Current classifier predictions:`);
  console.log(`  - technical: ${technicalCount}`);
  console.log(`  - non-technical: ${nonTechnicalCount}`);
  console.log();

  // Output posts for review - sorted by confidence (lowest first = most uncertain)
  const sortedByUncertainty = [...postsForReview].sort((a, b) => {
    const aDiff = Math.abs(a.scores.technical - a.scores['non-technical']);
    const bDiff = Math.abs(b.scores.technical - b.scores['non-technical']);
    return aDiff - bDiff; // Lower diff = more uncertain
  });

  console.log('=== POSTS SORTED BY UNCERTAINTY (review these first) ===\n');

  for (const post of sortedByUncertainty.slice(0, 50)) {
    const diff = Math.abs(post.scores.technical - post.scores['non-technical']).toFixed(2);
    console.log(`[${post.currentPrediction.toUpperCase()}] (uncertainty: ${diff})`);
    console.log(`  Title: ${post.title || '(no title)'}`);
    console.log(`  Newsletter: ${post.subdomain}`);
    console.log(`  Mentions: ${post.mentionCount}`);
    console.log(`  URL: ${post.url}`);
    console.log();
  }

  // Save to JSON for further processing
  const outputPath = path.join(__dirname, '../data/recent-posts-for-review.json');
  fs.writeFileSync(outputPath, JSON.stringify(postsForReview, null, 2));
  console.log(`\nFull data saved to: ${outputPath}`);
}

main().catch(console.error);
