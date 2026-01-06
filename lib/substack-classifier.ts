// Naive Bayes BOW classifier for filtering Substack posts
// Uses a pre-trained model from lib/classifier-model.json

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

// Load the trained model
// Note: This is loaded at module initialization time
let model: TrainedModel | null = null;

try {
  // Dynamic import for the model JSON
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  model = require('./classifier-model.json') as TrainedModel;
} catch {
  console.warn('Warning: classifier-model.json not found. Run "npm run train:classifier" to train the model.');
}

// Tokenize text into words (same logic as training script)
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

// Calculate log probability for a class given tokens
function classifyWithModel(tokens: string[], model: TrainedModel): { prediction: string; scores: Record<string, number> } {
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
  return { prediction, scores };
}

/**
 * Check if content is technical/intellectual vs non-technical
 * Uses Naive Bayes classifier trained on labeled data
 *
 * @param title - The title of the Substack post
 * @param description - Optional description/summary
 * @returns true if content is classified as technical
 */
export function isTechnicalContent(title: string, description?: string): boolean {
  if (!model) {
    // If no model is loaded, default to accepting all content
    console.warn('No classifier model loaded - accepting all content');
    return true;
  }

  const text = `${title} ${description || ''}`;
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    // Empty text - default to non-technical
    return false;
  }

  const { prediction } = classifyWithModel(tokens, model);
  return prediction === 'technical';
}

/**
 * Get classification details for debugging
 */
export function classifyContent(title: string, description?: string): {
  isTechnical: boolean;
  prediction: string;
  scores: Record<string, number>;
  tokens: string[];
  modelLoaded: boolean;
} {
  if (!model) {
    return {
      isTechnical: true,
      prediction: 'unknown',
      scores: {},
      tokens: [],
      modelLoaded: false,
    };
  }

  const text = `${title} ${description || ''}`;
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return {
      isTechnical: false,
      prediction: 'non-technical',
      scores: { technical: 0, 'non-technical': 0 },
      tokens: [],
      modelLoaded: true,
    };
  }

  const { prediction, scores } = classifyWithModel(tokens, model);

  return {
    isTechnical: prediction === 'technical',
    prediction,
    scores,
    tokens,
    modelLoaded: true,
  };
}

/**
 * Get model metadata
 */
export function getModelInfo(): {
  loaded: boolean;
  metadata?: TrainedModel['metadata'];
} {
  if (!model) {
    return { loaded: false };
  }

  return {
    loaded: true,
    metadata: model.metadata,
  };
}
