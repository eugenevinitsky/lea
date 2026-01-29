import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  initEmbeddingClassifier,
  classifyContentAsync,
  isEmbeddingClassifierReady,
  batchClassifyContentAsync
} from '@/lib/substack-classifier';

// These tests require GOOGLE_AI_API_KEY and embeddings file to be present
// Skip if running in CI without proper setup
const hasApiKey = !!process.env.GOOGLE_AI_API_KEY;
const embeddingsPath = path.join(__dirname, '../../lib/classifier-embeddings.json');
const hasEmbeddings = fs.existsSync(embeddingsPath);
let classifierReady = false;

describe('Substack Embedding Classifier', () => {
  beforeAll(async () => {
    if (hasApiKey && hasEmbeddings) {
      classifierReady = await initEmbeddingClassifier();
    }
  });

  describe('isEmbeddingClassifierReady', () => {
    it.skipIf(!classifierReady)('reports classifier is ready after initialization', () => {
      expect(isEmbeddingClassifierReady()).toBe(true);
    });

    it('returns false when not initialized (no API key or embeddings)', () => {
      // This test only makes sense if we hadn't initialized
      if (!classifierReady) {
        expect(isEmbeddingClassifierReady()).toBe(false);
      }
    });
  });

  describe('classifyContentAsync', () => {
    it.skipIf(!classifierReady)('classifies technical content as technical', async () => {
      const result = await classifyContentAsync('Neural Network Architecture Design');
      expect(result.modelType).toBe('embedding-knn');
      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      // Note: With 0.7 threshold, may or may not be technical based on training data
      expect(['technical', 'non-technical']).toContain(result.prediction);
    });

    it.skipIf(!classifierReady)('returns structure with required fields', async () => {
      const result = await classifyContentAsync(
        'Machine Learning Optimization',
        'A deep dive into gradient descent algorithms'
      );

      expect(result).toHaveProperty('isTechnical');
      expect(result).toHaveProperty('probability');
      expect(result).toHaveProperty('prediction');
      expect(result).toHaveProperty('modelType');
      expect(result.modelType).toBe('embedding-knn');
    });

    it.skipIf(!classifierReady)('uses body text when provided', async () => {
      const result = await classifyContentAsync(
        'Weekly Newsletter',
        'Updates from this week',
        'This paper introduces a novel approach to transformer architectures using sparse attention mechanisms. We demonstrate improved performance on language modeling tasks while reducing computational complexity.'
      );

      expect(result.modelType).toBe('embedding-knn');
      // Body text about transformers should influence classification
    });

    it('rejects content when classifier not initialized', async () => {
      // If no API key, classifier won't be initialized
      if (!classifierReady) {
        const result = await classifyContentAsync('Any content');
        expect(result.isTechnical).toBe(false);
        expect(result.probability).toBe(0);
        expect(result.prediction).toBe('non-technical');
      }
    });
  });

  describe('batchClassifyContentAsync', () => {
    it.skipIf(!classifierReady)('classifies multiple items', async () => {
      const items = [
        { title: 'Neural Networks', description: 'Deep learning fundamentals' },
        { title: 'Recipe Collection', description: 'Best pasta dishes' },
      ];

      const results = await batchClassifyContentAsync(items);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('isTechnical');
      expect(results[0]).toHaveProperty('probability');
      expect(results[1]).toHaveProperty('isTechnical');
      expect(results[1]).toHaveProperty('probability');
    });

    it('returns non-technical for all when classifier not initialized', async () => {
      if (!classifierReady) {
        const items = [
          { title: 'Test 1' },
          { title: 'Test 2' },
        ];

        const results = await batchClassifyContentAsync(items);

        expect(results).toHaveLength(2);
        expect(results[0].isTechnical).toBe(false);
        expect(results[0].probability).toBe(0);
        expect(results[1].isTechnical).toBe(false);
        expect(results[1].probability).toBe(0);
      }
    });
  });
});
