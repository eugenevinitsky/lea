/**
 * Train an embedding-based classifier using Google's free Gemini API
 *
 * 1. Get free API key from: https://aistudio.google.com/app/apikey
 * 2. Add to .env.local: GOOGLE_AI_API_KEY=your_key_here
 * 3. Run: npx tsx scripts/train-embedding-classifier.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.GOOGLE_AI_API_KEY;
if (!API_KEY) {
  console.error('Missing GOOGLE_AI_API_KEY in .env.local');
  console.error('Get free key from: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

interface EmbeddingData {
  embeddings: number[][];
  labels: number[]; // 1 = technical, 0 = non-technical
  texts: string[];
  centroidTechnical: number[];
  centroidNonTechnical: number[];
  metadata: {
    trainedAt: string;
    numExamples: { technical: number; nonTechnical: number };
    embeddingDim: number;
    model: string;
  };
}

// Batch embed texts (API allows up to 100 at a time)
async function batchEmbed(texts: string[], batchSize = 50): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`  Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}...`);

    const result = await model.batchEmbedContents({
      requests: batch.map(text => ({
        content: { role: 'user', parts: [{ text }] },
      })),
    });

    for (const embedding of result.embeddings) {
      allEmbeddings.push(embedding.values);
    }

    // Rate limit: wait a bit between batches
    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return allEmbeddings;
}

// Compute centroid of embeddings
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

// Cosine similarity
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  // Load training data
  const dataPath = path.join(process.cwd(), 'data', 'training-data.json');
  const trainingData: TrainingExample[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`Loaded ${trainingData.length} training examples`);

  const technical = trainingData.filter(d => d.label === 'technical');
  const nonTechnical = trainingData.filter(d => d.label === 'non-technical');

  console.log(`  Technical: ${technical.length}`);
  console.log(`  Non-technical: ${nonTechnical.length}`);

  // Truncate text to avoid token limits (keep first 500 chars)
  const texts = trainingData.map(d => d.text.slice(0, 500));
  const labels = trainingData.map(d => d.label === 'technical' ? 1 : 0);

  console.log('\nGenerating embeddings...');
  const embeddings = await batchEmbed(texts);

  console.log(`\nGenerated ${embeddings.length} embeddings (dim=${embeddings[0].length})`);

  // Compute class centroids
  const techEmbeddings = embeddings.filter((_, i) => labels[i] === 1);
  const nonTechEmbeddings = embeddings.filter((_, i) => labels[i] === 0);

  const centroidTechnical = computeCentroid(techEmbeddings);
  const centroidNonTechnical = computeCentroid(nonTechEmbeddings);

  console.log('\nComputed class centroids');

  // Test centroid classifier on training data
  let correct = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const simTech = cosineSim(embeddings[i], centroidTechnical);
    const simNonTech = cosineSim(embeddings[i], centroidNonTechnical);
    const pred = simTech > simNonTech ? 1 : 0;
    if (pred === labels[i]) correct++;
  }
  console.log(`Training accuracy (centroid): ${(correct / embeddings.length * 100).toFixed(1)}%`);

  // Save embedding data
  const outputPath = path.join(process.cwd(), 'lib', 'classifier-embeddings.json');
  const data: EmbeddingData = {
    embeddings,
    labels,
    texts: texts.map(t => t.slice(0, 100)), // Store truncated for reference
    centroidTechnical,
    centroidNonTechnical,
    metadata: {
      trainedAt: new Date().toISOString(),
      numExamples: { technical: technical.length, nonTechnical: nonTechnical.length },
      embeddingDim: embeddings[0].length,
      model: 'text-embedding-004',
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(data));
  console.log(`\nSaved embeddings to ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
