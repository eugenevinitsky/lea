/**
 * Train an embedding-based classifier using Google's Gemini API
 *
 * Features:
 * - Saves progress after each batch (resume if interrupted)
 * - Supports incremental updates (only embeds new examples)
 * - Rate limit handling with exponential backoff
 *
 * Usage:
 *   npx tsx scripts/train-embedding-classifier.ts          # Full training or resume
 *   npx tsx scripts/train-embedding-classifier.ts --fresh  # Force fresh start
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
const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

const CHECKPOINT_PATH = path.join(process.cwd(), 'data', 'embedding-checkpoint.json');
const OUTPUT_PATH = path.join(process.cwd(), 'lib', 'classifier-embeddings.json');
const TRAINING_DATA_PATH = path.join(process.cwd(), 'data', 'training-data.json');

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

interface Checkpoint {
  embeddings: number[][];
  labels: number[];
  texts: string[];
  processedCount: number;
  model: string;
}

interface EmbeddingData {
  embeddings: number[][];
  labels: number[];
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

// Embed a single batch with retry logic
async function embedBatch(texts: string[], maxRetries = 10): Promise<number[][]> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const result = await model.batchEmbedContents({
        requests: texts.map(text => ({
          content: { role: 'user', parts: [{ text }] },
        })),
      });
      return result.embeddings.map(e => e.values);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 429) {
        retries++;
        // Exponential backoff: 60s, 120s, 180s, ... up to 5 min
        const delay = Math.min(60000 * retries, 300000);
        console.log(`  Rate limited. Waiting ${Math.round(delay / 1000)}s (retry ${retries}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Save checkpoint to disk
function saveCheckpoint(checkpoint: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint));
}

// Load checkpoint if exists
function loadCheckpoint(): Checkpoint | null {
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
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
  const freshStart = process.argv.includes('--fresh');

  // Load training data
  const trainingData: TrainingExample[] = JSON.parse(fs.readFileSync(TRAINING_DATA_PATH, 'utf-8'));
  console.log(`Loaded ${trainingData.length} training examples`);

  const technical = trainingData.filter(d => d.label === 'technical');
  const nonTechnical = trainingData.filter(d => d.label === 'non-technical');
  console.log(`  Technical: ${technical.length}`);
  console.log(`  Non-technical: ${nonTechnical.length}`);

  // Prepare texts and labels
  const texts = trainingData.map(d => d.text.slice(0, 500));
  const labels = trainingData.map(d => d.label === 'technical' ? 1 : 0);

  // Check for existing checkpoint
  let checkpoint = freshStart ? null : loadCheckpoint();
  let embeddings: number[][] = [];
  let startIdx = 0;

  if (checkpoint && checkpoint.model === 'gemini-embedding-001') {
    // Check if checkpoint matches current training data
    const checkpointValid = checkpoint.processedCount <= texts.length &&
      checkpoint.texts.slice(0, Math.min(10, checkpoint.texts.length))
        .every((t, i) => t === texts[i]?.slice(0, 100));

    if (checkpointValid) {
      embeddings = checkpoint.embeddings;
      startIdx = checkpoint.processedCount;
      console.log(`\nResuming from checkpoint: ${startIdx}/${texts.length} already processed`);
    } else {
      console.log('\nCheckpoint invalid (training data changed), starting fresh');
    }
  }

  // Process remaining texts in batches
  const batchSize = 25; // Smaller batches for better rate limit handling
  const totalBatches = Math.ceil((texts.length - startIdx) / batchSize);

  if (startIdx < texts.length) {
    console.log(`\nGenerating embeddings for ${texts.length - startIdx} texts...`);

    for (let i = startIdx; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
      const batchNum = Math.floor((i - startIdx) / batchSize) + 1;
      const percent = Math.round((i / texts.length) * 100);

      console.log(`  Batch ${batchNum}/${totalBatches} (${percent}% overall)...`);

      const batchEmbeddings = await embedBatch(batch);
      embeddings.push(...batchEmbeddings);

      // Save checkpoint after each batch
      saveCheckpoint({
        embeddings,
        labels: labels.slice(0, embeddings.length),
        texts: texts.slice(0, embeddings.length).map(t => t.slice(0, 100)),
        processedCount: embeddings.length,
        model: 'gemini-embedding-001',
      });

      // Wait between batches - minimal delay, rely on rate limit handling if needed
      // Paid tier has 1500+ req/min, batch of 25 = we can do ~60 batches/min easily
      if (i + batchSize < texts.length) {
        const delay = 200; // 200ms = 5 batches/sec = 300 batches/min (well under limit)
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.log(`\nGenerated ${embeddings.length} embeddings (dim=${embeddings[0].length})`);

  // Compute class centroids
  const techEmbeddings = embeddings.filter((_, i) => labels[i] === 1);
  const nonTechEmbeddings = embeddings.filter((_, i) => labels[i] === 0);
  const centroidTechnical = computeCentroid(techEmbeddings);
  const centroidNonTechnical = computeCentroid(nonTechEmbeddings);

  console.log('Computed class centroids');

  // Test accuracy
  let correct = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const simTech = cosineSim(embeddings[i], centroidTechnical);
    const simNonTech = cosineSim(embeddings[i], centroidNonTechnical);
    const pred = simTech > simNonTech ? 1 : 0;
    if (pred === labels[i]) correct++;
  }
  console.log(`Training accuracy (centroid): ${(correct / embeddings.length * 100).toFixed(1)}%`);

  // Save final embeddings
  const data: EmbeddingData = {
    embeddings,
    labels,
    texts: texts.map(t => t.slice(0, 100)),
    centroidTechnical,
    centroidNonTechnical,
    metadata: {
      trainedAt: new Date().toISOString(),
      numExamples: { technical: technical.length, nonTechnical: nonTechnical.length },
      embeddingDim: embeddings[0].length,
      model: 'gemini-embedding-001',
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data));
  console.log(`\nSaved embeddings to ${OUTPUT_PATH}`);
  console.log(`File size: ${(fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2)} MB`);

  // Clean up checkpoint
  if (fs.existsSync(CHECKPOINT_PATH)) {
    fs.unlinkSync(CHECKPOINT_PATH);
    console.log('Removed checkpoint file');
  }
}

main().catch(console.error);
