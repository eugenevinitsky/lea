/**
 * Naive Bayes TF-IDF Classifier Training Script
 *
 * Trains a Naive Bayes classifier with TF-IDF weighting on labeled text data
 * and outputs a model JSON file for runtime inference.
 *
 * Usage: npx tsx scripts/train-classifier.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

interface TrainedModel {
  vocabulary: string[];
  idf: Record<string, number>;
  classPriors: Record<string, number>;
  wordLogProbs: Record<string, Record<string, number>>;
  unknownWordLogProb: Record<string, number>;
  metadata: {
    trainedAt: string;
    numExamples: Record<string, number>;
    vocabularySize: number;
    totalDocuments: number;
  };
}

// Tokenize text into words
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Remove punctuation except hyphens within words
    .replace(/[^\w\s-]/g, ' ')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 0);
}

// Calculate term frequency (normalized by document length)
function calculateTF(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  // Normalize by document length
  const docLength = tokens.length;
  for (const token of Object.keys(tf)) {
    tf[token] = tf[token] / docLength;
  }
  return tf;
}

// Train the Naive Bayes classifier with TF-IDF
function train(examples: TrainingExample[]): TrainedModel {
  const classes = ['technical', 'non-technical'] as const;
  const totalDocs = examples.length;

  // Count documents per class
  const docCounts: Record<string, number> = {};
  for (const cls of classes) {
    docCounts[cls] = examples.filter(e => e.label === cls).length;
  }

  // Calculate class priors (log probabilities)
  const classPriors: Record<string, number> = {};
  for (const cls of classes) {
    classPriors[cls] = Math.log(docCounts[cls] / totalDocs);
  }

  // Build vocabulary and document frequency for IDF
  const vocabulary = new Set<string>();
  const docFrequency: Record<string, number> = {}; // How many docs contain each word

  // First pass: build vocabulary and count document frequency
  for (const example of examples) {
    const tokens = tokenize(example.text);
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      vocabulary.add(token);
      docFrequency[token] = (docFrequency[token] || 0) + 1;
    }
  }

  const vocabArray = Array.from(vocabulary).sort();
  const vocabSize = vocabArray.length;

  // Calculate IDF: log(N / df) with smoothing to avoid division by zero
  const idf: Record<string, number> = {};
  for (const word of vocabArray) {
    // Add 1 to denominator for smoothing
    idf[word] = Math.log(totalDocs / (docFrequency[word] + 1)) + 1; // +1 to ensure IDF >= 1
  }

  // Second pass: accumulate TF-IDF weighted counts per class
  const tfidfSumsPerClass: Record<string, Record<string, number>> = {};
  const totalTfidfPerClass: Record<string, number> = {};

  for (const cls of classes) {
    tfidfSumsPerClass[cls] = {};
    totalTfidfPerClass[cls] = 0;
  }

  for (const example of examples) {
    const tokens = tokenize(example.text);
    const tf = calculateTF(tokens);

    for (const [token, tfValue] of Object.entries(tf)) {
      const tfidf = tfValue * (idf[token] || 1);
      tfidfSumsPerClass[example.label][token] = (tfidfSumsPerClass[example.label][token] || 0) + tfidf;
      totalTfidfPerClass[example.label] += tfidf;
    }
  }

  // Calculate log P(word|class) with Laplace smoothing on TF-IDF weighted counts
  const wordLogProbs: Record<string, Record<string, number>> = {};
  const unknownWordLogProb: Record<string, number> = {};

  for (const cls of classes) {
    wordLogProbs[cls] = {};
    const denominator = totalTfidfPerClass[cls] + vocabSize;

    for (const word of vocabArray) {
      const tfidfSum = tfidfSumsPerClass[cls][word] || 0;
      // Laplace smoothing: add 1 to numerator, add vocabSize to denominator
      wordLogProbs[cls][word] = Math.log((tfidfSum + 1) / denominator);
    }

    // Log probability for unknown words
    unknownWordLogProb[cls] = Math.log(1 / denominator);
  }

  return {
    vocabulary: vocabArray,
    idf,
    classPriors,
    wordLogProbs,
    unknownWordLogProb,
    metadata: {
      trainedAt: new Date().toISOString(),
      numExamples: docCounts,
      vocabularySize: vocabSize,
      totalDocuments: totalDocs,
    },
  };
}

// Main
function main() {
  const dataPath = path.join(__dirname, '../data/training-data.json');
  const outputPath = path.join(__dirname, '../lib/classifier-model.json');

  console.log('Loading training data from:', dataPath);

  if (!fs.existsSync(dataPath)) {
    console.error('Error: Training data file not found at', dataPath);
    console.error('Please create data/training-data.json with labeled examples.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const examples: TrainingExample[] = JSON.parse(rawData);

  // Validate training data
  const technicalCount = examples.filter(e => e.label === 'technical').length;
  const nonTechnicalCount = examples.filter(e => e.label === 'non-technical').length;

  console.log(`Found ${examples.length} training examples:`);
  console.log(`  - technical: ${technicalCount}`);
  console.log(`  - non-technical: ${nonTechnicalCount}`);

  if (technicalCount < 10 || nonTechnicalCount < 10) {
    console.warn('\nWarning: Recommend at least 10 examples per class for reasonable accuracy.');
    console.warn('For best results, use 100+ examples per class.\n');
  }

  console.log('\nTraining classifier...');
  const model = train(examples);

  console.log(`\nModel trained successfully:`);
  console.log(`  - Vocabulary size: ${model.metadata.vocabularySize} words`);
  console.log(`  - Class priors:`);
  for (const [cls, logProb] of Object.entries(model.classPriors)) {
    console.log(`    - ${cls}: ${Math.exp(logProb).toFixed(4)} (${logProb.toFixed(4)} log)`);
  }

  // Write model to file
  fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
  console.log(`\nModel saved to: ${outputPath}`);

  // Test with a few examples using TF-IDF weighted inference
  console.log('\n--- Quick Test (TF-IDF weighted) ---');
  const testTexts = [
    'How Neural Networks Learn',
    'Trump Policy Sparks Debate',
    'Machine Learning Optimization Algorithms',
    'Democrats vs Republicans',
  ];

  for (const text of testTexts) {
    const tokens = tokenize(text);
    const tf = calculateTF(tokens);
    const scores: Record<string, number> = {};

    for (const cls of ['technical', 'non-technical']) {
      let score = model.classPriors[cls];
      for (const [token, tfValue] of Object.entries(tf)) {
        // Weight the log probability by TF-IDF
        const idfValue = model.idf[token] || 1;
        const weight = tfValue * idfValue;
        if (model.wordLogProbs[cls][token] !== undefined) {
          score += weight * model.wordLogProbs[cls][token];
        } else {
          score += weight * model.unknownWordLogProb[cls];
        }
      }
      scores[cls] = score;
    }

    const prediction = scores['technical'] > scores['non-technical'] ? 'technical' : 'non-technical';
    console.log(`"${text}" => ${prediction}`);
    console.log(`  scores: technical=${scores['technical'].toFixed(2)}, non-technical=${scores['non-technical'].toFixed(2)}`);
  }
}

main();
