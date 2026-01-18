/**
 * Embedding-based classifier using Google's Gemini API
 *
 * Uses k-NN (k nearest neighbors) for classification.
 * At runtime, embeds input text and finds closest training examples.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Pre-computed embeddings and labels
let trainEmbeddings: number[][] | null = null;
let trainLabels: number[] | null = null;
let embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;

interface ClassifierResult {
  isTechnical: boolean;
  probability: number;
  prediction: 'technical' | 'non-technical';
  scores: {
    technical: number;
    nonTechnical: number;
  };
  modelType: 'embedding-knn';
  nearestNeighbors?: { text: string; label: string; similarity: number }[];
}

// Cosine similarity between two vectors
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Initialize the embedding classifier
 */
export function initEmbeddingClassifier(
  apiKey: string,
  data: { embeddings: number[][]; labels: number[]; texts?: string[] }
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  trainEmbeddings = data.embeddings;
  trainLabels = data.labels;
}

/**
 * Load training data from the pre-computed JSON file
 */
export async function loadEmbeddingData(): Promise<{
  embeddings: number[][];
  labels: number[];
  texts: string[];
}> {
  const data = await import('./classifier-embeddings.json');
  return {
    embeddings: data.embeddings as number[][],
    labels: data.labels as number[],
    texts: data.texts as string[],
  };
}

/**
 * Classify text using k-NN on embeddings
 */
export async function classifyWithEmbedding(
  text: string,
  k: number = 15,
  returnNeighbors: boolean = false
): Promise<ClassifierResult> {
  if (!embeddingModel || !trainEmbeddings || !trainLabels) {
    throw new Error('Embedding classifier not initialized. Call initEmbeddingClassifier first.');
  }

  // Truncate to avoid token limits
  const truncated = text.slice(0, 500);

  // Get embedding for input text
  const result = await embeddingModel.embedContent(truncated);

  const embedding = result.embedding.values;

  // Find k nearest neighbors
  const similarities: { idx: number; sim: number }[] = [];
  for (let i = 0; i < trainEmbeddings.length; i++) {
    similarities.push({ idx: i, sim: cosineSim(embedding, trainEmbeddings[i]) });
  }

  similarities.sort((a, b) => b.sim - a.sim);
  const topK = similarities.slice(0, k);

  // Count votes weighted by similarity
  let techScore = 0;
  let nonTechScore = 0;

  for (const { idx, sim } of topK) {
    // Weight by similarity (higher sim = more weight)
    const weight = sim;
    if (trainLabels[idx] === 1) {
      techScore += weight;
    } else {
      nonTechScore += weight;
    }
  }

  // Normalize to probability
  const total = techScore + nonTechScore;
  const probability = techScore / total;

  return {
    isTechnical: probability >= 0.5,
    probability,
    prediction: probability >= 0.5 ? 'technical' : 'non-technical',
    scores: {
      technical: techScore,
      nonTechnical: nonTechScore,
    },
    modelType: 'embedding-knn',
  };
}

/**
 * Batch classify multiple texts (more efficient)
 */
export async function batchClassifyWithEmbedding(
  texts: string[],
  k: number = 15
): Promise<ClassifierResult[]> {
  if (!embeddingModel || !trainEmbeddings || !trainLabels) {
    throw new Error('Embedding classifier not initialized. Call initEmbeddingClassifier first.');
  }

  // Truncate texts
  const truncated = texts.map(t => t.slice(0, 500));

  // Batch embed
  const result = await embeddingModel.batchEmbedContents({
    requests: truncated.map(text => ({
      content: { role: 'user', parts: [{ text }] },
    })),
  });

  // Classify each embedding using k-NN
  return result.embeddings.map(emb => {
    const embedding = emb.values;

    // Find k nearest neighbors
    const similarities: { idx: number; sim: number }[] = [];
    for (let i = 0; i < trainEmbeddings!.length; i++) {
      similarities.push({ idx: i, sim: cosineSim(embedding, trainEmbeddings![i]) });
    }

    similarities.sort((a, b) => b.sim - a.sim);
    const topK = similarities.slice(0, k);

    let techScore = 0;
    let nonTechScore = 0;

    for (const { idx, sim } of topK) {
      const weight = sim;
      if (trainLabels![idx] === 1) {
        techScore += weight;
      } else {
        nonTechScore += weight;
      }
    }

    const total = techScore + nonTechScore;
    const probability = techScore / total;

    return {
      isTechnical: probability >= 0.5,
      probability,
      prediction: probability >= 0.5 ? 'technical' : 'non-technical' as const,
      scores: {
        technical: techScore,
        nonTechnical: nonTechScore,
      },
      modelType: 'embedding-knn' as const,
    };
  });
}

/**
 * Get info about the embedding classifier
 */
export function getEmbeddingModelInfo() {
  return {
    initialized: !!embeddingModel,
    hasTrainingData: !!trainEmbeddings && !!trainLabels,
    numTrainingExamples: trainEmbeddings?.length ?? 0,
    model: 'text-embedding-004',
    embeddingDim: trainEmbeddings?.[0]?.length ?? 0,
  };
}
