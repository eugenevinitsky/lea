// Embedding-based k-NN classifier for filtering Substack posts
// Uses Google's text-embedding-004 model with pre-computed training embeddings

import { GoogleGenerativeAI } from '@google/generative-ai';

// Embedding classifier state
let embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
let trainEmbeddings: number[][] | null = null;
let trainLabels: number[] | null = null;
let embeddingClassifierInitialized = false;

// Classification threshold - balance between FPR and recall
// IMPORTANT: This threshold is used by both ingestion and cleanup - keep them in sync!
export const TECHNICAL_THRESHOLD = 0.65;

// Classification stats for monitoring
let classificationStats = {
  total: 0,
  accepted: 0,
  rejected: 0,
  errors: 0,
  lastReset: new Date(),
};

export function getClassificationStats() {
  return { ...classificationStats };
}

export function resetClassificationStats() {
  classificationStats = {
    total: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    lastReset: new Date(),
  };
}

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
 * Compute k-NN probability for a single embedding
 * Applies class weighting to account for real-world distribution
 * Training data: ~30% tech, ~70% non-tech
 * Real world: ~5% tech, ~95% non-tech
 * Adjust non-tech weight: (0.95/0.70) / (0.05/0.30) = 8.14x
 */
function computeKnnProbability(embedding: number[], k: number = 15): number {
  if (!trainEmbeddings || !trainLabels) return 0;

  const similarities: { idx: number; sim: number }[] = [];
  for (let i = 0; i < trainEmbeddings.length; i++) {
    similarities.push({ idx: i, sim: cosineSimilarity(embedding, trainEmbeddings[i]) });
  }

  similarities.sort((a, b) => b.sim - a.sim);
  const topK = similarities.slice(0, k);

  // Class weighting - reduced since training data was cleaned
  const NON_TECH_WEIGHT = 1.0;

  let techScore = 0;
  let nonTechScore = 0;

  for (const { idx, sim } of topK) {
    if (trainLabels[idx] === 1) {
      techScore += sim;
    } else {
      nonTechScore += sim * NON_TECH_WEIGHT;
    }
  }

  return techScore / (techScore + nonTechScore);
}

/**
 * Classify content using embedding k-NN
 * Uses minimum probability between title+description and body text
 * Returns non-technical if classifier is not initialized (fail-safe)
 *
 * @param options.logDecision - If true, logs the classification decision (default: false)
 * @param options.context - Additional context for logging (e.g., 'ingestion', 'cleanup')
 */
export async function classifyContentAsync(
  title: string,
  description?: string,
  bodyText?: string,
  k: number = 15,
  options?: { logDecision?: boolean; context?: string }
): Promise<{
  isTechnical: boolean;
  probability: number;
  titleDescProb: number;
  bodyProb: number | null;
  prediction: 'technical' | 'non-technical';
  modelType: 'embedding-knn';
  classifierReady: boolean;
}> {
  const logDecision = options?.logDecision ?? false;
  const context = options?.context ?? 'unknown';
  const shortTitle = title?.slice(0, 60) || '(no title)';

  classificationStats.total++;

  // If embedding classifier not ready, reject content (fail-safe)
  if (!embeddingClassifierInitialized || !embeddingModel || !trainEmbeddings || !trainLabels) {
    classificationStats.errors++;
    console.error(`[CLASSIFIER ERROR] [${context}] Classifier not initialized - rejecting: "${shortTitle}"`);
    return {
      isTechnical: false,
      probability: 0,
      titleDescProb: 0,
      bodyProb: null,
      prediction: 'non-technical',
      modelType: 'embedding-knn',
      classifierReady: false,
    };
  }

  // Always classify title + description
  const titleDescText = `${title} ${description || ''}`.slice(0, 500);
  const titleDescResult = await embeddingModel.embedContent(titleDescText);
  const titleDescProb = computeKnnProbability(titleDescResult.embedding.values, k);

  // If body text available, also classify it and take minimum
  let probability = titleDescProb;
  let bodyProb: number | null = null;
  if (bodyText && bodyText.length > 100) {
    const bodyResult = await embeddingModel.embedContent(bodyText.slice(0, 500));
    bodyProb = computeKnnProbability(bodyResult.embedding.values, k);
    // Take minimum - if either looks non-technical, classify as non-technical
    probability = Math.min(titleDescProb, bodyProb);
  }

  const isTechnical = probability >= TECHNICAL_THRESHOLD;

  if (isTechnical) {
    classificationStats.accepted++;
  } else {
    classificationStats.rejected++;
  }

  if (logDecision) {
    const decision = isTechnical ? 'ACCEPTED' : 'REJECTED';
    const bodyInfo = bodyProb !== null ? `, body=${bodyProb.toFixed(3)}` : ', body=N/A';
    console.log(`[CLASSIFIER] [${context}] ${decision} prob=${probability.toFixed(3)} (title=${titleDescProb.toFixed(3)}${bodyInfo}) "${shortTitle}"`);
  }

  return {
    isTechnical,
    probability,
    titleDescProb,
    bodyProb,
    prediction: isTechnical ? 'technical' : 'non-technical',
    modelType: 'embedding-knn',
    classifierReady: true,
  };
}

/**
 * Batch classify content using embeddings (more efficient for multiple items)
 * Uses minimum probability between title+description and body text
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

  const results: { isTechnical: boolean; probability: number; prediction: 'technical' | 'non-technical' }[] = [];

  for (const item of items) {
    // Always classify title + description
    const titleDescText = `${item.title} ${item.description || ''}`.slice(0, 500);
    const titleDescRes = await embeddingModel.embedContent(titleDescText);
    const titleDescProb = computeKnnProbability(titleDescRes.embedding.values, k);

    // If body text available, also classify it and take minimum
    let probability = titleDescProb;
    if (item.bodyText && item.bodyText.length > 100) {
      const bodyRes = await embeddingModel.embedContent(item.bodyText.slice(0, 500));
      const bodyProb = computeKnnProbability(bodyRes.embedding.values, k);
      probability = Math.min(titleDescProb, bodyProb);
    }

    results.push({
      isTechnical: probability >= TECHNICAL_THRESHOLD,
      probability,
      prediction: probability >= TECHNICAL_THRESHOLD ? 'technical' : 'non-technical',
    });
  }

  return results;
}
