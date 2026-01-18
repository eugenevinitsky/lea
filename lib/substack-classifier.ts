// TF-IDF + Logistic Regression classifier for filtering Substack posts
// Uses a pre-trained model from lib/classifier-model.json
//
// Features:
// - Stopword removal
// - Bigram support
// - Sublinear TF scaling
// - Calibrated threshold from ROC analysis
// - Optional embedding-based k-NN classifier (requires GOOGLE_AI_API_KEY)

import { GoogleGenerativeAI } from '@google/generative-ai';

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
    trainAccuracy?: number;
    testAccuracy?: number;
    testPrecision?: number;
    testRecall?: number;
    testF1?: number;
    auc?: number;
    accuracy?: number; // Legacy field
  };
}

// Legacy Naive Bayes model interface for backwards compatibility
interface NaiveBayesModel {
  vocabulary: string[];
  idf?: Record<string, number>;
  classPriors: Record<string, number>;
  wordLogProbs: Record<string, Record<string, number>>;
  unknownWordLogProb: Record<string, number>;
  metadata: {
    trainedAt: string;
    numExamples: Record<string, number>;
    vocabularySize: number;
    totalDocuments?: number;
  };
}

type TrainedModel = TfIdfModel | NaiveBayesModel;

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
  'subscribe', 'click', 'read', 'share', 'like', 'comment', 'post', 'link', 'week',
  'today', 'yesterday', 'tomorrow', 'year', 'month', 'day', 'time', 'new', 'first',
  'last', 'next', 'get', 'got', 'make', 'made', 'see', 'saw', 'know', 'knew', 'think',
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
  'hadn', 'let', 'thanks', 'thank', 'please', 'well', 'really', 'actually', 'probably',
  'maybe', 'perhaps', 'still', 'already', 'always', 'never', 'ever', 'often', 'sometimes',
  'usually', 'especially', 'however', 'although', 'though', 'because', 'since', 'while',
  'unless', 'whether', 'even', 'much', 'many', 'little', 'less', 'least', 'long',
  'great', 'good', 'better', 'best', 'bad', 'worse', 'worst', 'right', 'wrong', 'sure',
  'thing', 'things', 'something', 'anything', 'nothing', 'everything', 'someone',
  'anyone', 'everyone', 'no one', 'nobody', 'everybody', 'somebody', 'anybody',
  'way', 'ways', 'fact', 'facts', 'case', 'cases', 'point', 'points', 'part', 'parts',
  'place', 'places', 'world', 'lot', 'lots', 'kind', 'kinds', 'sort', 'sorts',
  'type', 'types', 'bit', 'example', 'examples', 'number', 'numbers', 'group', 'groups',
  'problem', 'problems', 'question', 'questions', 'idea', 'ideas', 'issue', 'issues',
  'side', 'sides', 'area', 'areas', 'company', 'companies', 'system', 'systems',
  'program', 'programs', 'government', 'story', 'stories', 'life', 'lives',
  'work', 'works', 'working', 'job', 'jobs', 'hand', 'hands', 'eye', 'eyes', 'head',
  'heads', 'face', 'faces', 'word', 'words', 'room', 'rooms', 'home', 'homes',
  'house', 'houses', 'school', 'schools', 'student', 'students', 'child', 'children',
  'family', 'families', 'man', 'men', 'woman', 'women', 'person', 'people', 'country',
  'countries', 'state', 'states', 'city', 'cities', 'book', 'books', 'money',
  'business', 'water', 'food', 'night', 'morning', 'door', 'car', 'yes', 'no',
]);

// Load the trained model
let model: TrainedModel | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  model = require('./classifier-model.json') as TrainedModel;
} catch {
  console.warn('Warning: classifier-model.json not found. Run training script to train the model.');
}

// Tokenize text into words with stopword removal
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
      // Sublinear TF scaling: 1 + log(tf) instead of raw tf
      tf[token] = 1 + Math.log(tf[token]);
      tf[token] /= len;
    }
  }
  return tf;
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

// Legacy Naive Bayes classification for backwards compatibility
function classifyWithNaiveBayes(tokens: string[], model: NaiveBayesModel): {
  prediction: string;
  scores: Record<string, number>;
  margin: number;
  normalizedMargin: number;
} {
  const scores: Record<string, number> = {};
  const RAW_MARGIN_THRESHOLD = 0.65;

  const useTfIdf = model.idf && Object.keys(model.idf).length > 0;
  const tf = useTfIdf ? computeTf(tokens) : null;

  for (const cls of ['technical', 'non-technical']) {
    let score = model.classPriors[cls];

    if (useTfIdf && tf) {
      for (const [token, tfValue] of Object.entries(tf)) {
        const idfValue = model.idf![token] || 1;
        const weight = tfValue * idfValue;
        if (model.wordLogProbs[cls][token] !== undefined) {
          score += weight * model.wordLogProbs[cls][token];
        } else {
          score += weight * model.unknownWordLogProb[cls];
        }
      }
    } else {
      for (const token of tokens) {
        if (model.wordLogProbs[cls][token] !== undefined) {
          score += model.wordLogProbs[cls][token];
        } else {
          score += model.unknownWordLogProb[cls];
        }
      }
    }

    scores[cls] = score;
  }

  const margin = scores['technical'] - scores['non-technical'];
  const normalizedMargin = margin / (tokens.length + 1);

  const prediction = margin > RAW_MARGIN_THRESHOLD ? 'technical' : 'non-technical';
  return { prediction, scores, margin, normalizedMargin };
}

// Check if model is TF-IDF + Logistic Regression
function isTfIdfModel(m: TrainedModel): m is TfIdfModel {
  return 'type' in m && m.type === 'tfidf-logreg';
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
  const tokens = isTfIdfModel(model) ? tokenizeWithBigrams(text) : tokenize(text);

  if (tokens.length === 0) {
    return false;
  }

  if (isTfIdfModel(model)) {
    const { prediction } = classifyWithTfIdf(tokens, model);
    return prediction === 'technical';
  } else {
    const { prediction } = classifyWithNaiveBayes(tokens, model);
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
  const tokens = isTfIdfModel(model) ? tokenizeWithBigrams(text) : tokenize(text);

  if (tokens.length === 0) {
    return {
      isTechnical: false,
      prediction: 'non-technical',
      scores: { technical: 0, 'non-technical': 1 },
      tokens: [],
      modelLoaded: true,
      modelType: isTfIdfModel(model) ? 'tfidf-logreg' : 'naive-bayes',
    };
  }

  if (isTfIdfModel(model)) {
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
    const { prediction, scores, margin, normalizedMargin } = classifyWithNaiveBayes(tokens, model);
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
    type: isTfIdfModel(model) ? 'tfidf-logreg' : 'naive-bayes',
    metadata: model.metadata,
  };
}

// ============================================================
// EMBEDDING-BASED CLASSIFIER (Async, requires Google AI API)
// ============================================================

let embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
let trainEmbeddings: number[][] | null = null;
let trainLabels: number[] | null = null;
let embeddingClassifierInitialized = false;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Initialize embedding classifier with Google AI API
 * Call this once at startup
 */
export async function initEmbeddingClassifier(
  apiKey?: string,
  embeddingData?: { embeddings: number[][]; labels: number[] }
): Promise<boolean> {
  const key = apiKey || process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    console.warn('No GOOGLE_AI_API_KEY - embedding classifier not available');
    return false;
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

    // Use provided data or load from file
    if (embeddingData) {
      trainEmbeddings = embeddingData.embeddings;
      trainLabels = embeddingData.labels;
    } else {
      // Dynamic import for the JSON file
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data = require('./classifier-embeddings.json');
      trainEmbeddings = data.embeddings as number[][];
      trainLabels = data.labels as number[];
    }
    embeddingClassifierInitialized = true;

    console.log(`Embedding classifier initialized: ${trainEmbeddings.length} training examples`);
    return true;
  } catch (error) {
    console.warn('Failed to initialize embedding classifier:', error);
    return false;
  }
}

/**
 * Check if embedding classifier is ready
 */
export function isEmbeddingClassifierReady(): boolean {
  return embeddingClassifierInitialized && !!embeddingModel && !!trainEmbeddings;
}

/**
 * Classify content using embedding k-NN (async)
 * Falls back to TF-IDF if embedding classifier not initialized
 */
export async function classifyContentAsync(
  title: string,
  description?: string,
  bodyText?: string,
  k: number = 15
): Promise<{
  isTechnical: boolean;
  probability: number;
  prediction: 'technical' | 'non-technical';
  modelType: 'embedding-knn' | 'tfidf-logreg' | 'naive-bayes';
}> {
  // Fall back to TF-IDF if embedding classifier not ready
  if (!embeddingClassifierInitialized || !embeddingModel || !trainEmbeddings || !trainLabels) {
    const result = classifyContent(title, description);
    return {
      isTechnical: result.isTechnical,
      probability: result.probability ?? 0.5,
      prediction: result.isTechnical ? 'technical' : 'non-technical',
      modelType: result.modelType as 'tfidf-logreg' | 'naive-bayes',
    };
  }

  // Use body text if available (more informative), otherwise fall back to title + description
  const text = bodyText && bodyText.length > 100
    ? bodyText.slice(0, 500)
    : `${title} ${description || ''}`.slice(0, 500);

  // Get embedding
  const result = await embeddingModel.embedContent(text);

  const embedding = result.embedding.values;

  // k-NN classification
  const similarities: { idx: number; sim: number }[] = [];
  for (let i = 0; i < trainEmbeddings.length; i++) {
    similarities.push({ idx: i, sim: cosineSimilarity(embedding, trainEmbeddings[i]) });
  }

  similarities.sort((a, b) => b.sim - a.sim);
  const topK = similarities.slice(0, k);

  let techScore = 0;
  let nonTechScore = 0;

  for (const { idx, sim } of topK) {
    if (trainLabels[idx] === 1) {
      techScore += sim;
    } else {
      nonTechScore += sim;
    }
  }

  const probability = techScore / (techScore + nonTechScore);

  return {
    isTechnical: probability >= 0.6,
    probability,
    prediction: probability >= 0.5 ? 'technical' : 'non-technical',
    modelType: 'embedding-knn',
  };
}

/**
 * Batch classify content using embeddings (more efficient for multiple items)
 */
export async function batchClassifyContentAsync(
  items: { title: string; description?: string }[],
  k: number = 15
): Promise<{
  isTechnical: boolean;
  probability: number;
  prediction: 'technical' | 'non-technical';
}[]> {
  if (!embeddingClassifierInitialized || !embeddingModel || !trainEmbeddings || !trainLabels) {
    // Fall back to TF-IDF
    return items.map(item => {
      const result = classifyContent(item.title, item.description);
      return {
        isTechnical: result.isTechnical,
        probability: result.probability ?? 0.5,
        prediction: result.isTechnical ? 'technical' : 'non-technical',
      };
    });
  }

  const texts = items.map(item => `${item.title} ${item.description || ''}`.slice(0, 500));

  // Batch embed (process one at a time)
  const embeddingResults: number[][] = [];
  for (const text of texts) {
    const res = await embeddingModel.embedContent(text);
    embeddingResults.push(res.embedding.values);
  }

  // Classify each
  return embeddingResults.map(embedding => {
    const similarities: { idx: number; sim: number }[] = [];
    for (let i = 0; i < trainEmbeddings!.length; i++) {
      similarities.push({ idx: i, sim: cosineSimilarity(embedding, trainEmbeddings![i]) });
    }

    similarities.sort((a, b) => b.sim - a.sim);
    const topK = similarities.slice(0, k);

    let techScore = 0;
    let nonTechScore = 0;

    for (const { idx, sim } of topK) {
      if (trainLabels![idx] === 1) {
        techScore += sim;
      } else {
        nonTechScore += sim;
      }
    }

    const probability = techScore / (techScore + nonTechScore);

    return {
      isTechnical: probability >= 0.6,
      probability,
      prediction: probability >= 0.5 ? 'technical' : 'non-technical' as const,
    };
  });
}
