/**
 * Classifier False Positive Rate (FPR) Test
 *
 * This test ensures the classifier doesn't regress on FPR.
 * FPR = false positives / total negatives
 *     = (non-tech classified as tech) / total non-tech
 *
 * Uses a balanced sample of 100 examples each for fast CI runs.
 * The full dataset is in data/classifier-test-data.json for manual testing.
 *
 * NOTE: This test requires GOOGLE_AI_API_KEY to be set. It will be skipped in CI
 * if the key is not available.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { describe, it, expect, beforeAll } from 'vitest';

// Skip tests if API key is not available (e.g., in CI without secrets)
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const describeIfApiKey = GOOGLE_AI_API_KEY ? describe : describe.skip;
import * as fs from 'fs';
import * as path from 'path';
import { initEmbeddingClassifier, classifyContentAsync, isEmbeddingClassifierReady } from '@/lib/substack-classifier';

// Sample size for CI (balance speed vs statistical significance)
const SAMPLE_SIZE = 100;

// Process in parallel batches with delay between batches
async function classifyBatch(titles: string[], batchSize = 10): Promise<{ title: string; isTechnical: boolean; probability: number }[]> {
  const results: { title: string; isTechnical: boolean; probability: number }[] = [];

  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (title) => {
        try {
          const result = await classifyContentAsync(title, '');
          return { title, isTechnical: result.isTechnical, probability: result.probability };
        } catch (error) {
          // Retry once on failure
          await new Promise(r => setTimeout(r, 1000));
          const result = await classifyContentAsync(title, '');
          return { title, isTechnical: result.isTechnical, probability: result.probability };
        }
      })
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + batchSize < titles.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return results;
}

interface TestData {
  description: string;
  maxFPR: number;
  minRecall: number;
  nonTechnical: string[];
  technical: string[];
}

describeIfApiKey('Classifier FPR Validation', () => {
  let testData: TestData;
  let nonTechSample: string[];
  let techSample: string[];

  beforeAll(async () => {
    // Load test data
    const testPath = path.join(__dirname, '../data/classifier-test-data.json');
    testData = JSON.parse(fs.readFileSync(testPath, 'utf-8'));

    // Take random sample for faster CI
    nonTechSample = testData.nonTechnical
      .sort(() => Math.random() - 0.5)
      .slice(0, SAMPLE_SIZE);
    techSample = testData.technical
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(SAMPLE_SIZE, testData.technical.length));

    // Initialize classifier
    if (!isEmbeddingClassifierReady()) {
      const initialized = await initEmbeddingClassifier();
      if (!initialized) {
        throw new Error('Failed to initialize classifier. Check GOOGLE_AI_API_KEY.');
      }
    }
  }, 120000);

  it('should have acceptable FPR on non-technical content', async () => {
    const results = await classifyBatch(nonTechSample);

    const falsePositives = results.filter(r => r.isTechnical);
    const fpr = falsePositives.length / results.length;

    console.log(`\n=== FPR Test Results ===`);
    console.log(`Sample size: ${results.length} non-technical examples`);
    console.log(`False positives: ${falsePositives.length}`);
    console.log(`FPR: ${(fpr * 100).toFixed(2)}%`);
    console.log(`Max allowed FPR: ${(testData.maxFPR * 100).toFixed(2)}%`);

    if (falsePositives.length > 0) {
      console.log(`\nFalse positive examples:`);
      falsePositives.slice(0, 5).forEach(fp => {
        console.log(`  [${fp.probability.toFixed(3)}] ${fp.title.slice(0, 60)}`);
      });
    }

    expect(fpr).toBeLessThanOrEqual(testData.maxFPR);
  }, 120000);

  it('should have acceptable recall on technical content', async () => {
    const results = await classifyBatch(techSample);

    const truePositives = results.filter(r => r.isTechnical);
    const recall = truePositives.length / results.length;

    console.log(`\n=== Recall Test Results ===`);
    console.log(`Sample size: ${results.length} technical examples`);
    console.log(`True positives: ${truePositives.length}`);
    console.log(`Recall: ${(recall * 100).toFixed(2)}%`);
    console.log(`Min required recall: ${(testData.minRecall * 100).toFixed(2)}%`);

    const falseNegatives = results.filter(r => !r.isTechnical);
    if (falseNegatives.length > 0) {
      console.log(`\nFalse negative examples:`);
      falseNegatives.slice(0, 5).forEach(fn => {
        console.log(`  [${fn.probability.toFixed(3)}] ${fn.title.slice(0, 60)}`);
      });
    }

    expect(recall).toBeGreaterThanOrEqual(testData.minRecall);
  }, 120000);

  it('should output confusion matrix summary', async () => {
    // Use same samples from above for consistency
    const nonTechResults = await classifyBatch(nonTechSample.slice(0, 50));
    const techResults = await classifyBatch(techSample.slice(0, 50));

    const tp = techResults.filter(r => r.isTechnical).length;
    const fn = techResults.filter(r => !r.isTechnical).length;
    const fp = nonTechResults.filter(r => r.isTechnical).length;
    const tn = nonTechResults.filter(r => !r.isTechnical).length;

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const accuracy = (tp + tn) / (tp + tn + fp + fn);
    const fpr = fp / (fp + tn) || 0;

    console.log(`\n=== Confusion Matrix (50 each) ===`);
    console.log(`                 Predicted`);
    console.log(`              Tech    Non-Tech`);
    console.log(`Actual Tech   ${tp.toString().padStart(4)}    ${fn.toString().padStart(4)}   (TP, FN)`);
    console.log(`Actual Non    ${fp.toString().padStart(4)}    ${tn.toString().padStart(4)}   (FP, TN)`);
    console.log(`\nMetrics:`);
    console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`  F1 Score: ${(f1 * 100).toFixed(1)}%`);
    console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}%`);
    console.log(`  FPR: ${(fpr * 100).toFixed(1)}%`);

    // This test is informational, always passes
    expect(true).toBe(true);
  }, 120000);
});
