// Quick test script for borderline examples
const model = require('../lib/classifier-model.json');

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 0);
}

function computeTf(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const len = tokens.length;
  for (const token in tf) {
    tf[token] /= len;
  }
  return tf;
}

function classify(text: string) {
  const tokens = tokenize(text);
  const tf = computeTf(tokens);
  const scores: Record<string, number> = {};

  for (const cls of ['technical', 'non-technical']) {
    let score = model.classPriors[cls];
    for (const [token, tfValue] of Object.entries(tf)) {
      const idfValue = model.idf?.[token] || 1;
      const weight = (tfValue as number) * idfValue;
      if (model.wordLogProbs[cls][token] !== undefined) {
        score += weight * model.wordLogProbs[cls][token];
      } else {
        score += weight * model.unknownWordLogProb[cls];
      }
    }
    scores[cls] = score;
  }

  const margin = scores['technical'] - scores['non-technical'];
  const normalizedMargin = margin / (tokens.length + 1);
  const isTechnical = normalizedMargin > 0.05;

  return { isTechnical, normalizedMargin, scores };
}

const borderlineExamples = [
  "AI and the Future of Democracy",
  "How Misinformation Spreads on Social Networks",
  "The Economics of Climate Change Policy",
  "Understanding Vaccine Hesitancy: A Data-Driven Approach",
  "Why Congress Can't Fix Big Tech",
  "The Neuroscience of Political Polarization",
  "Building Better Government with Machine Learning",
  "Trump's Trade War: An Economic Analysis",
  "The Psychology of Online Radicalization",
  "Cryptocurrency Regulation: What You Need to Know",
  "How Algorithms Shape Our Political Views",
  "The Science Behind Polling Accuracy",
  "ChatGPT and the Future of Journalism",
  "Why Social Media Makes Us Angry",
  "Data Privacy in the Age of Surveillance",
];

console.log("=== BORDERLINE EXAMPLES TEST (TF-IDF) ===\n");

for (const title of borderlineExamples) {
  const result = classify(title);
  const margin = result.normalizedMargin.toFixed(3).padStart(7);
  const status = result.isTechnical ? '✓ TECH    ' : '✗ NON-TECH';
  console.log(status + ' (margin: ' + margin + '): "' + title + '"');
}
