/**
 * Naive Bayes BOW Classifier Training Script
 *
 * Trains a Naive Bayes classifier on labeled text data and outputs
 * a model JSON file for runtime inference.
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
  classPriors: Record<string, number>;
  wordLogProbs: Record<string, Record<string, number>>;
  unknownWordLogProb: Record<string, number>;
  metadata: {
    trainedAt: string;
    numExamples: Record<string, number>;
    vocabularySize: number;
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

// Train the Naive Bayes classifier
function train(examples: TrainingExample[]): TrainedModel {
  const classes = ['technical', 'non-technical'] as const;

  // Count documents per class
  const docCounts: Record<string, number> = {};
  for (const cls of classes) {
    docCounts[cls] = examples.filter(e => e.label === cls).length;
  }

  const totalDocs = examples.length;

  // Calculate class priors (log probabilities)
  const classPriors: Record<string, number> = {};
  for (const cls of classes) {
    classPriors[cls] = Math.log(docCounts[cls] / totalDocs);
  }

  // Build vocabulary and count words per class
  const wordCountsPerClass: Record<string, Record<string, number>> = {};
  const totalWordsPerClass: Record<string, number> = {};
  const vocabulary = new Set<string>();

  for (const cls of classes) {
    wordCountsPerClass[cls] = {};
    totalWordsPerClass[cls] = 0;
  }

  for (const example of examples) {
    const tokens = tokenize(example.text);
    for (const token of tokens) {
      vocabulary.add(token);
      wordCountsPerClass[example.label][token] = (wordCountsPerClass[example.label][token] || 0) + 1;
      totalWordsPerClass[example.label]++;
    }
  }

  const vocabArray = Array.from(vocabulary).sort();
  const vocabSize = vocabArray.length;

  // Calculate log P(word|class) with Laplace smoothing
  // P(word|class) = (count(word, class) + 1) / (totalWords(class) + vocabSize)
  const wordLogProbs: Record<string, Record<string, number>> = {};
  const unknownWordLogProb: Record<string, number> = {};

  for (const cls of classes) {
    wordLogProbs[cls] = {};
    const denominator = totalWordsPerClass[cls] + vocabSize;

    for (const word of vocabArray) {
      const count = wordCountsPerClass[cls][word] || 0;
      // Laplace smoothing: add 1 to numerator, add vocabSize to denominator
      wordLogProbs[cls][word] = Math.log((count + 1) / denominator);
    }

    // Log probability for unknown words (words not in vocabulary)
    // Use same smoothing formula with count = 0
    unknownWordLogProb[cls] = Math.log(1 / denominator);
  }

  return {
    vocabulary: vocabArray,
    classPriors,
    wordLogProbs,
    unknownWordLogProb,
    metadata: {
      trainedAt: new Date().toISOString(),
      numExamples: docCounts,
      vocabularySize: vocabSize,
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

  // Test with a few examples
  console.log('\n--- Quick Test ---');
  const testTexts = [
    'How Neural Networks Learn',
    'Trump Policy Sparks Debate',
    'Machine Learning Optimization Algorithms',
    'Democrats vs Republicans',
  ];

  for (const text of testTexts) {
    const tokens = tokenize(text);
    const scores: Record<string, number> = {};

    for (const cls of ['technical', 'non-technical']) {
      let score = model.classPriors[cls];
      for (const token of tokens) {
        if (model.wordLogProbs[cls][token] !== undefined) {
          score += model.wordLogProbs[cls][token];
        } else {
          score += model.unknownWordLogProb[cls];
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
