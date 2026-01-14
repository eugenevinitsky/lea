// TF-IDF + Logistic Regression classifier for filtering Substack posts
// Uses a pre-trained model from lib/classifier-model.json

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
    accuracy: number;
  };
}

interface NaiveBayesModel {
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

type TrainedModel = TfIdfModel | NaiveBayesModel;

// Load the trained model
let model: TrainedModel | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  model = require('./classifier-model.json') as TrainedModel;
} catch {
  console.warn('Warning: classifier-model.json not found. Run training script to train the model.');
}

// Tokenize text into words (same logic as training script)
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 0);
}

// Compute term frequency (normalized by doc length)
function computeTf(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const len = tokens.length;
  if (len > 0) {
    for (const token in tf) {
      tf[token] /= len;
    }
  }
  return tf;
}

// Compute TF-IDF vector for a document
function computeTfIdf(tokens: string[], idf: Record<string, number>): Record<string, number> {
  const tf = computeTf(tokens);
  const tfidf: Record<string, number> = {};
  const defaultIdf = Math.log(Object.keys(idf).length + 1);

  for (const token in tf) {
    const idfVal = idf[token] ?? defaultIdf;
    tfidf[token] = tf[token] * idfVal;
  }

  return tfidf;
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

// Sigmoid function
function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

// TF-IDF + Logistic Regression classification
function classifyWithTfIdf(tokens: string[], model: TfIdfModel): {
  prediction: string;
  probability: number;
  scores: Record<string, number>;
} {
  const tfidf = computeTfIdf(tokens, model.idf);
  const z = dotProduct(tfidf, model.weights) + model.bias;
  const prob = sigmoid(z);

  return {
    prediction: prob >= model.threshold ? 'technical' : 'non-technical',
    probability: prob,
    scores: { technical: prob, 'non-technical': 1 - prob },
  };
}

// Naive Bayes classification with length-normalized margin
// The raw margin grows with document length, so we normalize by token count
// to get a "per-word" margin that's comparable across documents
const NORMALIZED_MARGIN_THRESHOLD = 0.05; // Require margin > 0.05 for technical classification

function classifyWithNaiveBayes(tokens: string[], model: NaiveBayesModel): {
  prediction: string;
  scores: Record<string, number>;
  margin: number;
  normalizedMargin: number;
} {
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

  const margin = scores['technical'] - scores['non-technical'];
  // Normalize by token count to get per-word margin
  // Add 1 to avoid division by zero and to account for class prior contribution
  const normalizedMargin = margin / (tokens.length + 1);

  const prediction = normalizedMargin > NORMALIZED_MARGIN_THRESHOLD ? 'technical' : 'non-technical';
  return { prediction, scores, margin, normalizedMargin };
}

/**
 * Check if content is technical/intellectual vs non-technical
 *
 * @param title - The title of the Substack post
 * @param description - Optional description/summary
 * @returns true if content is classified as technical
 */
export function isTechnicalContent(title: string, description?: string): boolean {
  if (!model) {
    console.warn('No classifier model loaded - accepting all content');
    return true;
  }

  const text = `${title} ${description || ''}`;
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return false;
  }

  if ('type' in model && model.type === 'tfidf-logreg') {
    const { prediction } = classifyWithTfIdf(tokens, model);
    return prediction === 'technical';
  } else {
    const { prediction } = classifyWithNaiveBayes(tokens, model as NaiveBayesModel);
    return prediction === 'technical';
  }
}

/**
 * Get classification details for debugging
 */
export function classifyContent(title: string, description?: string): {
  isTechnical: boolean;
  prediction: string;
  probability?: number;
  scores: Record<string, number>;
  margin?: number;
  normalizedMargin?: number;
  tokens: string[];
  modelLoaded: boolean;
  modelType: string;
} {
  if (!model) {
    return {
      isTechnical: true,
      prediction: 'unknown',
      scores: {},
      tokens: [],
      modelLoaded: false,
      modelType: 'none',
    };
  }

  const text = `${title} ${description || ''}`;
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return {
      isTechnical: false,
      prediction: 'non-technical',
      scores: { technical: 0, 'non-technical': 1 },
      tokens: [],
      modelLoaded: true,
      modelType: 'type' in model ? model.type : 'naive-bayes',
    };
  }

  if ('type' in model && model.type === 'tfidf-logreg') {
    const { prediction, probability, scores } = classifyWithTfIdf(tokens, model);
    return {
      isTechnical: prediction === 'technical',
      prediction,
      probability,
      scores,
      tokens,
      modelLoaded: true,
      modelType: 'tfidf-logreg',
    };
  } else {
    const { prediction, scores, margin, normalizedMargin } = classifyWithNaiveBayes(tokens, model as NaiveBayesModel);
    return {
      isTechnical: prediction === 'technical',
      prediction,
      scores,
      margin,
      normalizedMargin,
      tokens,
      modelLoaded: true,
      modelType: 'naive-bayes',
    };
  }
}

/**
 * Get model metadata
 */
export function getModelInfo(): {
  loaded: boolean;
  type?: string;
  metadata?: TfIdfModel['metadata'] | NaiveBayesModel['metadata'];
} {
  if (!model) {
    return { loaded: false };
  }

  return {
    loaded: true,
    type: 'type' in model ? model.type : 'naive-bayes',
    metadata: model.metadata,
  };
}
