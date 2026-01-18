import { classifyContent } from '../lib/substack-classifier';
import model from '../lib/classifier-model.json';

const weights = model.weights as Record<string, number>;
const idf = model.idf as Record<string, number>;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'was', 'are', 'were', 'it', 'this', 'that', 'be', 'have', 'has', 'had',
  'i', 'you', 'we', 'they', 'my', 'your', 'our', 'his', 'her', 'its',
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

function debugClassification(text: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEXT: "${text}"`);
  console.log(`${'='.repeat(60)}`);

  const result = classifyContent(text);
  console.log(`\nProbability: ${result.probability?.toFixed(4)}`);
  console.log(`Prediction: ${result.prediction}`);

  const unigrams = tokenize(text);
  const bigrams = generateBigrams(unigrams);
  const tokens = [...unigrams, ...bigrams];

  console.log(`\nTokens: ${tokens.join(', ')}`);

  // Compute TF
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

  // Show contributions
  const contributions: { token: string; tfidf: number; weight: number; contribution: number; inVocab: boolean }[] = [];

  for (const token of tokens) {
    const hasIdf = idf[token] !== undefined;
    const hasWeight = weights[token] !== undefined;
    const tfidfVal = hasIdf ? tf[token] * idf[token] : 0;
    const weightVal = hasWeight ? weights[token] : 0;
    const contrib = tfidfVal * weightVal;

    contributions.push({
      token,
      tfidf: tfidfVal,
      weight: weightVal,
      contribution: contrib,
      inVocab: hasIdf && hasWeight,
    });
  }

  console.log('\nToken analysis:');
  for (const c of contributions) {
    const status = c.inVocab ? '' : ' [NOT IN VOCAB]';
    const sign = c.contribution >= 0 ? '+' : '';
    console.log(`  ${c.token}: weight=${c.weight.toFixed(3)}, contrib=${sign}${c.contribution.toFixed(4)}${status}`);
  }

  // Check what tech words SHOULD be in there
  const techWords = ['aws', 'certification', 'ai', 'machine', 'learning', 'security', 'cloud', 'api', 'data'];
  console.log('\nExpected tech words in vocabulary:');
  for (const word of techWords) {
    const hasIt = weights[word] !== undefined;
    const w = hasIt ? weights[word] : 0;
    console.log(`  ${word}: ${hasIt ? `weight=${w.toFixed(3)}` : 'NOT IN VOCAB'}`);
  }

  console.log(`\nBias: ${model.bias.toFixed(4)}`);
}

// Test cases that should score HIGH but don't
const lowScoringTechPosts = [
  "This is How I Passed the AWS Security Specialty Certification In Jan 2026",
  "AI Leaves The Cloud, Humans Get Left Behind, EU Slaps Grok",
  "Today in Generative Media - 1/8/26",
  "How to Copy Any Image or Video Style Using AI",
  "What Hospital and Health System CEOs Get Wrong About AI and Digital Transformation",
];

// Test cases that score correctly
const highScoringTechPosts = [
  "Machine Learning Optimization Algorithms",
  "Neural Network Architecture for Computer Vision",
  "Introduction to Quantum Computing",
];

console.log('\n### LOW-SCORING TECH POSTS (BUG) ###');
for (const text of lowScoringTechPosts) {
  debugClassification(text);
}

console.log('\n\n### HIGH-SCORING TECH POSTS (WORKING) ###');
for (const text of highScoringTechPosts) {
  debugClassification(text);
}
