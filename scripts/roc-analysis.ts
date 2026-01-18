/**
 * ROC Analysis for the embedding classifier
 * Computes TPR/FPR at different thresholds using leave-one-out cross-validation
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Load training data
// eslint-disable-next-line @typescript-eslint/no-require-imports
const data = require('../lib/classifier-embeddings.json');
const embeddings: number[][] = data.embeddings;
const labels: number[] = data.labels;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Leave-one-out k-NN probability for each example
function computeLooProbabilities(k: number = 15): number[] {
  const probabilities: number[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    const testEmbedding = embeddings[i];

    // Compute similarities to all OTHER examples
    const similarities: { idx: number; sim: number }[] = [];
    for (let j = 0; j < embeddings.length; j++) {
      if (j === i) continue; // Leave out the test example
      similarities.push({ idx: j, sim: cosineSimilarity(testEmbedding, embeddings[j]) });
    }

    similarities.sort((a, b) => b.sim - a.sim);
    const topK = similarities.slice(0, k);

    let techScore = 0;
    let nonTechScore = 0;

    for (const { idx, sim } of topK) {
      if (labels[idx] === 1) {
        techScore += sim;
      } else {
        nonTechScore += sim;
      }
    }

    const probability = techScore / (techScore + nonTechScore);
    probabilities.push(probability);
  }

  return probabilities;
}

// Compute TPR and FPR at a given threshold
function computeRates(probabilities: number[], threshold: number): { tpr: number; fpr: number; precision: number; f1: number } {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < probabilities.length; i++) {
    const predicted = probabilities[i] >= threshold ? 1 : 0;
    const actual = labels[i];

    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else if (predicted === 0 && actual === 1) fn++;
  }

  const tpr = tp / (tp + fn); // True Positive Rate (Recall)
  const fpr = fp / (fp + tn); // False Positive Rate
  const precision = tp / (tp + fp) || 0;
  const f1 = 2 * precision * tpr / (precision + tpr) || 0;

  return { tpr, fpr, precision, f1 };
}

async function main() {
  console.log('ROC Analysis for Embedding Classifier');
  console.log('=====================================\n');

  const techCount = labels.filter(l => l === 1).length;
  const nonTechCount = labels.filter(l => l === 0).length;
  console.log(`Training data: ${techCount} technical, ${nonTechCount} non-technical (total: ${labels.length})\n`);

  console.log('Computing leave-one-out probabilities...');
  const probabilities = computeLooProbabilities(15);

  console.log('\nROC Curve Data:');
  console.log('Threshold | TPR (Recall) | FPR | Precision | F1 Score');
  console.log('-'.repeat(60));

  const thresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
  for (const threshold of thresholds) {
    const { tpr, fpr, precision, f1 } = computeRates(probabilities, threshold);
    const marker = threshold === 0.75 ? ' <-- current' : '';
    console.log(`${threshold.toFixed(2)}      | ${(tpr * 100).toFixed(1)}%        | ${(fpr * 100).toFixed(1)}% | ${(precision * 100).toFixed(1)}%      | ${f1.toFixed(3)}${marker}`);
  }

  // Show distribution of probabilities by class
  console.log('\n\nProbability Distribution:');
  console.log('-'.repeat(40));

  const techProbs = probabilities.filter((_, i) => labels[i] === 1);
  const nonTechProbs = probabilities.filter((_, i) => labels[i] === 0);

  console.log(`\nTechnical posts (n=${techProbs.length}):`);
  console.log(`  Min: ${Math.min(...techProbs).toFixed(3)}`);
  console.log(`  Max: ${Math.max(...techProbs).toFixed(3)}`);
  console.log(`  Mean: ${(techProbs.reduce((a, b) => a + b, 0) / techProbs.length).toFixed(3)}`);
  console.log(`  < 0.75: ${techProbs.filter(p => p < 0.75).length} (${(techProbs.filter(p => p < 0.75).length / techProbs.length * 100).toFixed(1)}% would be filtered)`);

  console.log(`\nNon-technical posts (n=${nonTechProbs.length}):`);
  console.log(`  Min: ${Math.min(...nonTechProbs).toFixed(3)}`);
  console.log(`  Max: ${Math.max(...nonTechProbs).toFixed(3)}`);
  console.log(`  Mean: ${(nonTechProbs.reduce((a, b) => a + b, 0) / nonTechProbs.length).toFixed(3)}`);
  console.log(`  >= 0.75: ${nonTechProbs.filter(p => p >= 0.75).length} (${(nonTechProbs.filter(p => p >= 0.75).length / nonTechProbs.length * 100).toFixed(1)}% would slip through)`);

  // Show some examples near the threshold
  console.log('\n\nExamples near threshold (0.70-0.80):');
  console.log('-'.repeat(60));

  // We don't have titles in the embedding data, so just show indices
  const nearThreshold = probabilities
    .map((p, i) => ({ prob: p, idx: i, label: labels[i] }))
    .filter(x => x.prob >= 0.70 && x.prob <= 0.80)
    .sort((a, b) => a.prob - b.prob);

  console.log(`Found ${nearThreshold.length} examples with probability between 0.70-0.80`);
  console.log(`  Technical: ${nearThreshold.filter(x => x.label === 1).length}`);
  console.log(`  Non-technical: ${nearThreshold.filter(x => x.label === 0).length}`);
}

main().catch(console.error);
