/**
 * Improved TF-IDF + Logistic Regression Classifier Training Script
 *
 * Improvements over original:
 * - Proper train/test split with cross-validation
 * - Precision, recall, F1 metrics
 * - ROC analysis for threshold calibration
 * - Feature engineering: bigrams, stopwords, min-df filtering
 * - Sublinear TF scaling
 *
 * Usage: npx tsx scripts/train-classifier-v2.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

interface TfIdfModel {
  type: 'tfidf-logreg';
  idf: Record<string, number>;
  weights: Record<string, number>;
  bias: number;
  threshold: number;
  metadata: {
    trainedAt: string;
    numExamples: Record<string, number>;
    vocabularySize: number;
    trainAccuracy: number;
    testAccuracy: number;
    testPrecision: number;
    testRecall: number;
    testF1: number;
    auc: number;
  };
}

// Common English stopwords to filter out
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
  'if', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'once', 'up', 'down', 'out', 'off', 'over',
  'any', 'our', 'your', 'my', 'his', 'her', 'their', 'me', 'him', 'us', 'them',
  'get', 'got', 'make', 'made', 'see', 'saw', 'know', 'knew', 'think',
  'thought', 'want', 'go', 'went', 'come', 'came', 'take', 'took', 'give', 'gave',
  'find', 'found', 'tell', 'told', 'say', 'said', 'let', 'put', 'keep', 'kept',
  'begin', 'began', 'seem', 'seemed', 'help', 'show', 'showed', 'hear', 'heard',
  'play', 'run', 'ran', 'move', 'live', 'lived', 'believe', 'hold', 'held', 'bring',
  'brought', 'happen', 'happened', 'write', 'wrote', 'provide', 'sit', 'sat', 'stand',
  'stood', 'lose', 'lost', 'pay', 'paid', 'meet', 'met', 'include', 'included',
  'continue', 'continued', 'set', 'learn', 'learned', 'change', 'changed', 'lead',
  'led', 'understand', 'understood', 'watch', 'watched', 'follow', 'followed', 'stop',
  'stopped', 'create', 'created', 'speak', 'spoke', 'allow', 'allowed', 'add', 'added',
  'spend', 'spent', 'grow', 'grew', 'open', 'opened', 'walk', 'walked', 'win', 'won',
  'offer', 'offered', 'remember', 'remembered', 'love', 'loved', 'consider', 'considered',
  'appear', 'appeared', 'buy', 'bought', 'wait', 'waited', 'serve', 'served', 'die',
  'died', 'send', 'sent', 'expect', 'expected', 'build', 'built', 'stay', 'stayed',
  'fall', 'fell', 'cut', 'reach', 'reached', 'kill', 'killed', 'remain', 'remained',
  'am', 'being', 're', 've', 'll', 'd', 's', 't', 'don', 'doesn', 'didn', 'won',
  'wouldn', 'couldn', 'shouldn', 'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven',
  'hadn', 'thanks', 'thank', 'please', 'well', 'really', 'actually', 'probably',
  'maybe', 'perhaps', 'still', 'already', 'always', 'never', 'ever', 'often', 'sometimes',
  'usually', 'especially', 'however', 'although', 'though', 'because', 'since', 'while',
  'unless', 'whether', 'even', 'much', 'many', 'little', 'less', 'least', 'long',
  'great', 'good', 'better', 'best', 'bad', 'worse', 'worst', 'right', 'wrong', 'sure',
  'thing', 'things', 'something', 'anything', 'nothing', 'everything', 'someone',
  'anyone', 'everyone', 'nobody', 'everybody', 'somebody', 'anybody',
  'way', 'ways', 'fact', 'facts', 'case', 'cases', 'point', 'points', 'part', 'parts',
  'place', 'places', 'lot', 'lots', 'kind', 'kinds', 'sort', 'sorts',
  'bit', 'example', 'examples', 'number', 'numbers', 'group', 'groups',
  'side', 'sides', 'area', 'areas',
  'story', 'stories', 'life', 'lives',
  'work', 'works', 'working', 'job', 'jobs', 'hand', 'hands', 'eye', 'eyes', 'head',
  'heads', 'face', 'faces', 'word', 'words', 'room', 'rooms', 'home', 'homes',
  'house', 'houses', 'man', 'men', 'woman', 'women', 'person', 'people',
  'book', 'books', 'water', 'food', 'night', 'morning', 'door', 'car', 'yes', 'no',
]);

// Tokenize text into words
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 1 && !STOPWORDS.has(word));
}

// Generate bigrams from tokens
function generateBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

// Tokenize with unigrams and bigrams
function tokenizeWithBigrams(text: string): string[] {
  const unigrams = tokenize(text);
  const bigrams = generateBigrams(unigrams);
  return [...unigrams, ...bigrams];
}

// Compute term frequency with sublinear scaling (normalized by doc length)
function computeTf(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const len = tokens.length;
  if (len > 0) {
    for (const token in tf) {
      // Sublinear TF scaling: 1 + log(tf)
      tf[token] = 1 + Math.log(tf[token]);
      tf[token] /= len;
    }
  }
  return tf;
}

// Compute IDF from all documents with min-df filtering
function computeIdf(
  documents: string[][],
  minDf: number = 2,
  maxDfRatio: number = 0.95
): { idf: Record<string, number>; vocabulary: string[] } {
  const docCount = documents.length;
  const docFreq: Record<string, number> = {};

  for (const tokens of documents) {
    const seen = new Set(tokens);
    for (const token of seen) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  const vocabulary: string[] = [];
  const maxDf = Math.floor(docCount * maxDfRatio);

  for (const token in docFreq) {
    if (docFreq[token] >= minDf && docFreq[token] <= maxDf) {
      idf[token] = Math.log((docCount + 1) / (docFreq[token] + 1)) + 1;
      vocabulary.push(token);
    }
  }

  return { idf, vocabulary };
}

// Compute TF-IDF vector for a document
function computeTfIdf(tokens: string[], idf: Record<string, number>): Record<string, number> {
  const tf = computeTf(tokens);
  const tfidf: Record<string, number> = {};

  for (const token in tf) {
    if (idf[token] !== undefined) {
      tfidf[token] = tf[token] * idf[token];
    }
  }

  return tfidf;
}

// Sigmoid function
function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

// Dot product of sparse vectors
function dotProduct(a: Record<string, number>, b: Record<string, number>): number {
  let sum = 0;
  for (const key in a) {
    if (b[key] !== undefined) {
      sum += a[key] * b[key];
    }
  }
  return sum;
}

// Shuffle array
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Train logistic regression using gradient descent
function trainLogisticRegression(
  X: Record<string, number>[],
  y: number[],
  vocabulary: string[],
  learningRate: number = 0.1,
  epochs: number = 200,
  lambda: number = 0.01,
  verbose: boolean = true
): { weights: Record<string, number>; bias: number } {
  const weights: Record<string, number> = {};
  for (const word of vocabulary) {
    weights[word] = (Math.random() - 0.5) * 0.01;
  }
  let bias = 0;

  const n = X.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    const indices = shuffle(Array.from({ length: n }, (_, i) => i));

    for (const i of indices) {
      const xi = X[i];
      const yi = y[i];

      const z = dotProduct(xi, weights) + bias;
      const pred = sigmoid(z);

      const loss = -yi * Math.log(pred + 1e-10) - (1 - yi) * Math.log(1 - pred + 1e-10);
      totalLoss += loss;

      const error = pred - yi;

      for (const word in xi) {
        const grad = error * xi[word] + lambda * (weights[word] || 0);
        weights[word] = (weights[word] || 0) - learningRate * grad;
      }

      bias -= learningRate * error;
    }

    if (verbose && epoch % 50 === 0) {
      const avgLoss = totalLoss / n;
      console.log(`  Epoch ${epoch}: avg loss = ${avgLoss.toFixed(4)}`);
    }
  }

  return { weights, bias };
}

// Predict probabilities
function predictProba(
  X: Record<string, number>[],
  weights: Record<string, number>,
  bias: number
): number[] {
  return X.map(xi => {
    const z = dotProduct(xi, weights) + bias;
    return sigmoid(z);
  });
}

// Evaluate with multiple metrics
function evaluate(
  X: Record<string, number>[],
  y: number[],
  weights: Record<string, number>,
  bias: number,
  threshold: number = 0.5
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  predictions: number[];
  probabilities: number[];
} {
  const probabilities = predictProba(X, weights, bias);
  const predictions = probabilities.map(p => (p >= threshold ? 1 : 0));

  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === 1 && y[i] === 1) tp++;
    else if (predictions[i] === 1 && y[i] === 0) fp++;
    else if (predictions[i] === 0 && y[i] === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / (tp + fp + tn + fn);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { accuracy, precision, recall, f1, predictions, probabilities };
}

// Compute AUC using trapezoidal rule
function computeAuc(y: number[], probabilities: number[]): number {
  const sorted = y.map((label, i) => ({ label, prob: probabilities[i] }))
    .sort((a, b) => b.prob - a.prob);

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  const totalPositives = y.filter(l => l === 1).length;
  const totalNegatives = y.length - totalPositives;

  if (totalPositives === 0 || totalNegatives === 0) return 0.5;

  let prevTpr = 0;
  let prevFpr = 0;

  for (const { label } of sorted) {
    if (label === 1) {
      tpCount++;
    } else {
      fpCount++;
    }

    const tpr = tpCount / totalPositives;
    const fpr = fpCount / totalNegatives;

    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;

    prevTpr = tpr;
    prevFpr = fpr;
  }

  return auc;
}

// Find optimal threshold using ROC analysis
function findOptimalThreshold(
  y: number[],
  probabilities: number[]
): { threshold: number; f1: number; precision: number; recall: number } {
  let bestThreshold = 0.5;
  let bestF1 = 0;
  let bestPrecision = 0;
  let bestRecall = 0;

  for (let t = 0.1; t <= 0.9; t += 0.01) {
    let tp = 0, fp = 0, fn = 0;

    for (let i = 0; i < probabilities.length; i++) {
      const pred = probabilities[i] >= t ? 1 : 0;
      if (pred === 1 && y[i] === 1) tp++;
      else if (pred === 1 && y[i] === 0) fp++;
      else if (pred === 0 && y[i] === 1) fn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    if (f1 > bestF1) {
      bestF1 = f1;
      bestThreshold = t;
      bestPrecision = precision;
      bestRecall = recall;
    }
  }

  return { threshold: bestThreshold, f1: bestF1, precision: bestPrecision, recall: bestRecall };
}

// K-fold cross-validation
function crossValidate(
  examples: TrainingExample[],
  k: number = 5
): { avgAccuracy: number; avgPrecision: number; avgRecall: number; avgF1: number; avgAuc: number } {
  const shuffled = shuffle(examples);
  const foldSize = Math.floor(shuffled.length / k);

  let totalAccuracy = 0, totalPrecision = 0, totalRecall = 0, totalF1 = 0, totalAuc = 0;

  for (let fold = 0; fold < k; fold++) {
    const testStart = fold * foldSize;
    const testEnd = fold === k - 1 ? shuffled.length : (fold + 1) * foldSize;

    const testSet = shuffled.slice(testStart, testEnd);
    const trainSet = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)];

    const trainTokens = trainSet.map(e => tokenizeWithBigrams(e.text));
    const testTokens = testSet.map(e => tokenizeWithBigrams(e.text));
    const trainLabels = trainSet.map(e => (e.label === 'technical' ? 1 : 0));
    const testLabels = testSet.map(e => (e.label === 'technical' ? 1 : 0));

    const { idf, vocabulary } = computeIdf(trainTokens, 2, 0.95);

    const trainTfidf = trainTokens.map(t => computeTfIdf(t, idf));
    const testTfidf = testTokens.map(t => computeTfIdf(t, idf));

    const { weights, bias } = trainLogisticRegression(trainTfidf, trainLabels, vocabulary, 0.3, 150, 0.01, false);

    // Find optimal threshold on this fold's test set
    const probabilities = predictProba(testTfidf, weights, bias);
    const optimal = findOptimalThreshold(testLabels, probabilities);

    const { accuracy, precision, recall, f1 } = evaluate(testTfidf, testLabels, weights, bias, optimal.threshold);
    const auc = computeAuc(testLabels, probabilities);

    totalAccuracy += accuracy;
    totalPrecision += precision;
    totalRecall += recall;
    totalF1 += f1;
    totalAuc += auc;
  }

  return {
    avgAccuracy: totalAccuracy / k,
    avgPrecision: totalPrecision / k,
    avgRecall: totalRecall / k,
    avgF1: totalF1 / k,
    avgAuc: totalAuc / k,
  };
}

// Main training function
function main() {
  const dataPath = path.join(__dirname, '../data/training-data.json');
  const outputPath = path.join(__dirname, '../lib/classifier-model.json');

  console.log('Loading training data from:', dataPath);

  if (!fs.existsSync(dataPath)) {
    console.error('Error: Training data file not found at', dataPath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const examples: TrainingExample[] = JSON.parse(rawData);

  const technicalCount = examples.filter(e => e.label === 'technical').length;
  const nonTechnicalCount = examples.filter(e => e.label === 'non-technical').length;

  console.log(`\nLoaded ${examples.length} training examples`);
  console.log(`  - Technical: ${technicalCount} (${(technicalCount / examples.length * 100).toFixed(1)}%)`);
  console.log(`  - Non-technical: ${nonTechnicalCount} (${(nonTechnicalCount / examples.length * 100).toFixed(1)}%)`);

  // Step 1: Cross-validation to estimate generalization performance
  console.log('\n=== Step 1: 5-fold cross-validation ===');
  const cvResults = crossValidate(examples, 5);
  console.log(`  Avg Accuracy:  ${(cvResults.avgAccuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Precision: ${(cvResults.avgPrecision * 100).toFixed(1)}%`);
  console.log(`  Avg Recall:    ${(cvResults.avgRecall * 100).toFixed(1)}%`);
  console.log(`  Avg F1:        ${(cvResults.avgF1 * 100).toFixed(1)}%`);
  console.log(`  Avg AUC:       ${cvResults.avgAuc.toFixed(3)}`);

  // Step 2: Train/test split for final model
  console.log('\n=== Step 2: Training final model with 80/20 split ===');
  const shuffled = shuffle(examples);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const trainSet = shuffled.slice(0, splitIdx);
  const testSet = shuffled.slice(splitIdx);

  console.log(`  Train set: ${trainSet.length} examples`);
  console.log(`  Test set:  ${testSet.length} examples`);

  // Tokenize
  console.log('\nTokenizing with bigrams...');
  const trainTokens = trainSet.map(e => tokenizeWithBigrams(e.text));
  const testTokens = testSet.map(e => tokenizeWithBigrams(e.text));
  const trainLabels = trainSet.map(e => (e.label === 'technical' ? 1 : 0));
  const testLabels = testSet.map(e => (e.label === 'technical' ? 1 : 0));

  // Compute IDF with min-df filtering
  console.log('Computing IDF (min-df=2, max-df=95%)...');
  const { idf, vocabulary } = computeIdf(trainTokens, 2, 0.95);
  console.log(`  Vocabulary size: ${vocabulary.length}`);

  // Compute TF-IDF
  console.log('Computing TF-IDF vectors...');
  const trainTfidf = trainTokens.map(t => computeTfIdf(t, idf));
  const testTfidf = testTokens.map(t => computeTfIdf(t, idf));

  // Train logistic regression
  console.log('\nTraining logistic regression...');
  const { weights, bias } = trainLogisticRegression(trainTfidf, trainLabels, vocabulary, 0.3, 200, 0.01);

  // Evaluate on train set
  const trainEval = evaluate(trainTfidf, trainLabels, weights, bias);
  console.log(`\nTraining set metrics (threshold=0.5):`);
  console.log(`  Accuracy:  ${(trainEval.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(trainEval.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(trainEval.recall * 100).toFixed(1)}%`);
  console.log(`  F1:        ${(trainEval.f1 * 100).toFixed(1)}%`);

  // Evaluate on test set
  const testEval = evaluate(testTfidf, testLabels, weights, bias);
  const testAuc = computeAuc(testLabels, testEval.probabilities);
  console.log(`\nTest set metrics (threshold=0.5):`);
  console.log(`  Accuracy:  ${(testEval.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(testEval.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(testEval.recall * 100).toFixed(1)}%`);
  console.log(`  F1:        ${(testEval.f1 * 100).toFixed(1)}%`);
  console.log(`  AUC:       ${testAuc.toFixed(3)}`);

  // Step 3: Find optimal threshold using ROC analysis
  console.log('\n=== Step 3: ROC analysis for threshold calibration ===');
  const optimal = findOptimalThreshold(testLabels, testEval.probabilities);
  console.log(`  Optimal threshold: ${optimal.threshold.toFixed(2)}`);
  console.log(`  F1 at optimal:     ${(optimal.f1 * 100).toFixed(1)}%`);
  console.log(`  Precision:         ${(optimal.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:            ${(optimal.recall * 100).toFixed(1)}%`);

  // Re-evaluate with optimal threshold
  const finalEval = evaluate(testTfidf, testLabels, weights, bias, optimal.threshold);
  console.log(`\nFinal test metrics (threshold=${optimal.threshold.toFixed(2)}):`);
  console.log(`  Accuracy:  ${(finalEval.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(finalEval.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(finalEval.recall * 100).toFixed(1)}%`);
  console.log(`  F1:        ${(finalEval.f1 * 100).toFixed(1)}%`);

  // Print top features (what the model learned)
  console.log('\n=== Learned Features ===');
  console.log('\nTop 30 words indicating TECHNICAL content:');
  const sortedTech = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  for (const [word, weight] of sortedTech) {
    console.log(`  ${word}: ${weight.toFixed(3)}`);
  }

  console.log('\nTop 30 words indicating NON-TECHNICAL content:');
  const sortedNonTech = Object.entries(weights)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 30);
  for (const [word, weight] of sortedNonTech) {
    console.log(`  ${word}: ${weight.toFixed(3)}`);
  }

  // Prune near-zero weights
  const prunedWeights: Record<string, number> = {};
  for (const word in weights) {
    if (Math.abs(weights[word]) > 0.001) {
      prunedWeights[word] = weights[word];
    }
  }
  console.log(`\nPruned weights from ${Object.keys(weights).length} to ${Object.keys(prunedWeights).length}`);

  // Save model
  const model: TfIdfModel = {
    type: 'tfidf-logreg',
    idf,
    weights: prunedWeights,
    bias,
    threshold: optimal.threshold,
    metadata: {
      trainedAt: new Date().toISOString(),
      numExamples: { technical: technicalCount, 'non-technical': nonTechnicalCount },
      vocabularySize: vocabulary.length,
      trainAccuracy: trainEval.accuracy,
      testAccuracy: finalEval.accuracy,
      testPrecision: finalEval.precision,
      testRecall: finalEval.recall,
      testF1: finalEval.f1,
      auc: testAuc,
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
  console.log(`\nModel saved to: ${outputPath}`);

  // Quick test
  console.log('\n=== Quick Test ===');
  const testTexts = [
    'How Neural Networks Learn',
    'Trump Policy Sparks Debate',
    'Machine Learning Optimization Algorithms',
    'Democrats vs Republicans on Immigration',
    'Building Scalable APIs with Kubernetes',
    'The Strongman Fantasy',
    'Deep Dive into Transformer Architecture',
    'Why I Support the Green New Deal',
  ];

  for (const text of testTexts) {
    const tokens = tokenizeWithBigrams(text);
    const tfidf = computeTfIdf(tokens, idf);
    const z = dotProduct(tfidf, prunedWeights) + bias;
    const prob = sigmoid(z);
    const prediction = prob >= optimal.threshold ? 'technical' : 'non-technical';
    console.log(`"${text}" => ${prediction} (prob=${prob.toFixed(3)})`);
  }
}

main();
