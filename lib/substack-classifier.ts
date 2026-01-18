// Embedding-based k-NN classifier for filtering Substack posts
// Uses Google's text-embedding-004 model with pre-computed training embeddings

import { GoogleGenerativeAI } from '@google/generative-ai';

// Embedding classifier state
let embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
let trainEmbeddings: number[][] | null = null;
let trainLabels: number[] | null = null;
let embeddingClassifierInitialized = false;

// Classification threshold - posts need >= 0.7 probability to be considered technical
const TECHNICAL_THRESHOLD = 0.7;

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
    console.error('No GOOGLE_AI_API_KEY - embedding classifier cannot initialize');
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
    console.error('Failed to initialize embedding classifier:', error);
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
 * Classify content using embedding k-NN
 * Returns non-technical if classifier is not initialized (fail-safe)
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
  modelType: 'embedding-knn';
}> {
  // If embedding classifier not ready, reject content (fail-safe)
  if (!embeddingClassifierInitialized || !embeddingModel || !trainEmbeddings || !trainLabels) {
    console.warn('Embedding classifier not initialized - rejecting content');
    return {
      isTechnical: false,
      probability: 0,
      prediction: 'non-technical',
      modelType: 'embedding-knn',
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
    isTechnical: probability >= TECHNICAL_THRESHOLD,
    probability,
    prediction: probability >= TECHNICAL_THRESHOLD ? 'technical' : 'non-technical',
    modelType: 'embedding-knn',
  };
}

/**
 * Batch classify content using embeddings (more efficient for multiple items)
 */
export async function batchClassifyContentAsync(
  items: { title: string; description?: string; bodyText?: string }[],
  k: number = 15
): Promise<{
  isTechnical: boolean;
  probability: number;
  prediction: 'technical' | 'non-technical';
}[]> {
  if (!embeddingClassifierInitialized || !embeddingModel || !trainEmbeddings || !trainLabels) {
    // Reject all if classifier not ready
    return items.map(() => ({
      isTechnical: false,
      probability: 0,
      prediction: 'non-technical' as const,
    }));
  }

  const texts = items.map(item => {
    if (item.bodyText && item.bodyText.length > 100) {
      return item.bodyText.slice(0, 500);
    }
    return `${item.title} ${item.description || ''}`.slice(0, 500);
  });

  // Batch embed (process one at a time due to API limits)
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
      isTechnical: probability >= TECHNICAL_THRESHOLD,
      probability,
      prediction: probability >= TECHNICAL_THRESHOLD ? 'technical' : 'non-technical' as const,
    };
  });
}
