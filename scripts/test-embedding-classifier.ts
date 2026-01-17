/**
 * Test the embedding classifier on sample posts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initEmbeddingClassifier, classifyWithEmbedding, loadEmbeddingData } from '../lib/embedding-classifier';

const API_KEY = process.env.GOOGLE_AI_API_KEY;
if (!API_KEY) {
  console.error('Missing GOOGLE_AI_API_KEY in .env.local');
  console.error('Get free key from: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

async function main() {
  console.log('Loading embedding data...');
  const data = await loadEmbeddingData();
  console.log(`Loaded ${data.embeddings.length} training embeddings (dim=${data.embeddings[0].length})`);

  console.log('Initializing classifier...');
  initEmbeddingClassifier(API_KEY, data);

  const testCases = [
    // Should be clearly technical (expect 0.95+)
    'This is How I Passed the AWS Security Specialty Certification In Jan 2026',
    'Journal Club: Cell-type-specific dendritic integration and canonical cortical circuits',
    'TSMC beats, AI chip boom ignites',
    'Deep Learning for Computer Vision',
    'Machine Learning Optimization Algorithms',
    'Kubernetes Tutorial: From Zero to Production',
    'PyTorch Lightning Tutorial: Training Neural Networks at Scale',

    // Should be clearly non-technical (expect < 0.3)
    'Trump Policy Sparks Debate Among Republicans',
    'Democrats vs Republicans: The Battle Continues',
    'My Journey Through Grief and Healing',
    'Best Restaurants in New York City 2026',
    'Why I Left My Corporate Job to Travel the World',
  ];

  console.log('\n=== Testing Embedding Classifier ===\n');

  for (const text of testCases) {
    const result = await classifyWithEmbedding(text);
    const bar = '█'.repeat(Math.round(result.probability * 20)) + '░'.repeat(20 - Math.round(result.probability * 20));
    console.log(`[${result.probability.toFixed(3)}] ${bar} ${text.slice(0, 60)}`);
  }
}

main().catch(console.error);
