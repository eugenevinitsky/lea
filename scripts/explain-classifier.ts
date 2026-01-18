// Explain how the TF-IDF + Logistic Regression classifier works
import model from '../lib/classifier-model.json';

console.log('=== TF-IDF + LOGISTIC REGRESSION CLASSIFIER EXPLANATION ===\n');

console.log('MODEL STRUCTURE:');
console.log('- Type:', model.type);
console.log('- Vocabulary size:', model.metadata.vocabularySize, 'features');
console.log('- Training examples:', model.metadata.numExamples);
console.log('- Threshold:', model.threshold);
console.log('');

console.log('PERFORMANCE METRICS:');
console.log('- Test Accuracy:', ((model.metadata.testAccuracy ?? 0) * 100).toFixed(1) + '%');
console.log('- Test Precision:', ((model.metadata.testPrecision ?? 0) * 100).toFixed(1) + '%');
console.log('- Test Recall:', ((model.metadata.testRecall ?? 0) * 100).toFixed(1) + '%');
console.log('- Test F1:', ((model.metadata.testF1 ?? 0) * 100).toFixed(1) + '%');
console.log('- AUC:', (model.metadata.auc ?? 0).toFixed(3));
console.log('');

console.log('HOW CLASSIFICATION WORKS:');
console.log('1. Tokenize text into words (with stopword removal)');
console.log('2. Generate bigrams (word pairs)');
console.log('3. Compute TF-IDF vector (term frequency * inverse document frequency)');
console.log('4. Compute dot product: z = weights · tfidf + bias');
console.log('5. Apply sigmoid: probability = 1 / (1 + exp(-z))');
console.log('6. If probability >= threshold, classify as TECHNICAL');
console.log('');

// Show top technical words
const weights = model.weights as Record<string, number>;
const sortedByWeight = Object.entries(weights).sort((a, b) => b[1] - a[1]);

console.log('TOP 20 FEATURES FOR TECHNICAL:');
for (const [word, weight] of sortedByWeight.slice(0, 20)) {
  console.log(`  ${word}: ${weight.toFixed(3)}`);
}
console.log('');

console.log('TOP 20 FEATURES FOR NON-TECHNICAL:');
const bottomWords = sortedByWeight.slice(-20).reverse();
for (const [word, weight] of bottomWords) {
  console.log(`  ${word}: ${weight.toFixed(3)}`);
}
console.log('');

// Example classification
console.log('=== EXAMPLE CLASSIFICATION ===\n');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'was', 'are', 'were', 'it', 'this', 'that', 'be', 'have', 'has', 'had',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 1 && !STOPWORDS.has(word));
}

function generateBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

function computeTf(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const len = tokens.length;
  if (len > 0) {
    for (const token in tf) {
      tf[token] = (1 + Math.log(tf[token])) / len;
    }
  }
  return tf;
}

const exampleTexts = [
  "Machine learning optimization algorithms",
  "Trump policy sparks debate among republicans",
  "Neural network architecture for computer vision",
];

const idf = model.idf as Record<string, number>;

for (const text of exampleTexts) {
  console.log(`Text: "${text}"`);

  const unigrams = tokenize(text);
  const bigrams = generateBigrams(unigrams);
  const tokens = [...unigrams, ...bigrams];
  const tf = computeTf(tokens);

  console.log('Tokens:', tokens.join(', '));

  let z = model.bias;
  const contributions: { token: string; contribution: number }[] = [];

  for (const token in tf) {
    if (idf[token] !== undefined && weights[token] !== undefined) {
      const tfidf = tf[token] * idf[token];
      const contribution = tfidf * weights[token];
      contributions.push({ token, contribution });
      z += contribution;
    }
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  console.log('Top contributions:');
  for (const { token, contribution } of contributions.slice(0, 5)) {
    const sign = contribution >= 0 ? '+' : '';
    console.log(`  ${token}: ${sign}${contribution.toFixed(3)}`);
  }

  const prob = 1 / (1 + Math.exp(-z));
  const prediction = prob >= model.threshold ? 'TECHNICAL' : 'NON-TECHNICAL';

  console.log(`Bias: ${model.bias.toFixed(3)}`);
  console.log(`z = ${z.toFixed(3)}`);
  console.log(`Probability: ${prob.toFixed(3)}`);
  console.log(`Prediction: ${prediction} (threshold: ${model.threshold})`);
  console.log('');
}
