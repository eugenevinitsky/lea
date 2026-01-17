/**
 * Test embedding classifier on trending Substack posts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initEmbeddingClassifier, classifyContentAsync } from '../lib/substack-classifier';

const API_KEY = process.env.GOOGLE_AI_API_KEY!;

interface SubstackPost {
  id: number;
  name: string;
  title: string;
  subtitle: string;
  post_date: string;
  publication_name: string;
}

async function fetchTrendingPosts(limit: number = 300): Promise<SubstackPost[]> {
  const posts: SubstackPost[] = [];
  const batchSize = 30;

  for (let offset = 0; offset < limit; offset += batchSize) {
    console.log(`Fetching posts ${offset + 1}-${Math.min(offset + batchSize, limit)}...`);

    const url = `https://substack.com/api/v1/trending?limit=${batchSize}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status}`);
      break;
    }

    const data = await response.json();
    if (!data.posts || data.posts.length === 0) break;

    posts.push(...data.posts);

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  return posts;
}

async function main() {
  console.log('Initializing embedding classifier...');
  const data = require('../lib/classifier-embeddings.json');
  await initEmbeddingClassifier(API_KEY, data);

  console.log('\nFetching trending Substack posts...');
  const posts = await fetchTrendingPosts(300);
  console.log(`Fetched ${posts.length} posts\n`);

  console.log('Classifying posts...');
  const results: { title: string; subtitle: string; probability: number; publication: string }[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const text = `${post.title} ${post.subtitle || ''}`;

    try {
      const result = await classifyContentAsync(post.title, post.subtitle);
      results.push({
        title: post.title,
        subtitle: post.subtitle || '',
        probability: result.probability,
        publication: post.publication_name || '',
      });

      if ((i + 1) % 50 === 0) {
        console.log(`  Classified ${i + 1}/${posts.length}`);
      }
    } catch (error) {
      console.error(`Error classifying: ${post.title}`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  // Sort by probability
  results.sort((a, b) => b.probability - a.probability);

  // Distribution
  console.log('\n=== DISTRIBUTION ===');
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const count = results.filter(r => r.probability >= t).length;
    const pct = (count / results.length * 100).toFixed(1);
    console.log(`>= ${t}: ${count}/${results.length} (${pct}%)`);
  }

  // Top 30 (most technical)
  console.log('\n=== TOP 30 (Most Technical) ===');
  for (const r of results.slice(0, 30)) {
    console.log(`[${r.probability.toFixed(3)}] ${r.title.slice(0, 60)}`);
    if (r.subtitle) console.log(`         ${r.subtitle.slice(0, 55)}...`);
  }

  // Bottom 30 (least technical)
  console.log('\n=== BOTTOM 30 (Least Technical) ===');
  for (const r of results.slice(-30)) {
    console.log(`[${r.probability.toFixed(3)}] ${r.title.slice(0, 60)}`);
  }

  // Borderline (0.4-0.6)
  const borderline = results.filter(r => r.probability >= 0.4 && r.probability < 0.6);
  console.log(`\n=== BORDERLINE (0.4-0.6): ${borderline.length} posts ===`);
  for (const r of borderline.slice(0, 20)) {
    console.log(`[${r.probability.toFixed(3)}] ${r.title.slice(0, 60)}`);
  }
}

main().catch(console.error);
