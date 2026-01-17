import { describe, it, expect } from 'vitest';
import { isTechnicalContent, classifyContent, getModelInfo } from '@/lib/substack-classifier';

describe('Substack Classifier', () => {
  describe('getModelInfo', () => {
    it('reports model is loaded', () => {
      const info = getModelInfo();
      expect(info.loaded).toBe(true);
      expect(info.type).toBe('tfidf-logreg');
      expect(info.metadata).toBeDefined();
      expect(info.metadata?.vocabularySize).toBeGreaterThan(0);
    });
  });

  describe('isTechnicalContent', () => {
    it('classifies technical content as technical', () => {
      expect(isTechnicalContent('Neural Network Architecture Design')).toBe(true);
      expect(isTechnicalContent('Machine Learning Optimization Algorithms')).toBe(true);
      expect(isTechnicalContent('How Transformers Work in NLP')).toBe(true);
      expect(isTechnicalContent('Introduction to Quantum Computing')).toBe(true);
    });

    it('classifies non-technical content as non-technical', () => {
      expect(isTechnicalContent('Trump Policy Sparks Debate')).toBe(false);
      expect(isTechnicalContent('Democrats vs Republicans')).toBe(false);
      expect(isTechnicalContent('Trump Immigration Policy Crisis')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(isTechnicalContent('')).toBe(false);
      expect(isTechnicalContent('   ')).toBe(false);
    });

    it('handles description parameter', () => {
      // Technical title with technical description
      expect(isTechnicalContent('Research Paper', 'A study on neural networks and deep learning')).toBe(true);

      // Non-technical title with political description
      expect(isTechnicalContent('Weekly Update', 'Latest news on the election campaign and voting')).toBe(false);
    });
  });

  describe('classifyContent', () => {
    it('returns detailed classification info for TF-IDF model', () => {
      const result = classifyContent('Deep Learning for Computer Vision');

      expect(result.modelLoaded).toBe(true);
      expect(result.modelType).toBe('tfidf-logreg');
      expect(result.prediction).toBe('technical');
      expect(result.isTechnical).toBe(true);
      expect(result.probability).toBeDefined();
      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.scores).toHaveProperty('technical');
      expect(result.scores).toHaveProperty('non-technical');
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it('returns correct structure for non-technical content', () => {
      const result = classifyContent('Trump Republican Democrat Election Campaign');

      expect(result.modelLoaded).toBe(true);
      expect(result.prediction).toBe('non-technical');
      expect(result.isTechnical).toBe(false);
    });

    it('includes token list with bigrams', () => {
      const result = classifyContent('Machine Learning');

      expect(result.tokens).toContain('machine');
      expect(result.tokens).toContain('learning');
      // Should also have bigram
      expect(result.tokens).toContain('machine_learning');
    });

    it('handles empty input', () => {
      const result = classifyContent('');

      expect(result.isTechnical).toBe(false);
      expect(result.tokens).toHaveLength(0);
    });
  });

  describe('borderline cases', () => {
    it('classifies clearly political content as non-technical', () => {
      // Political framing should win
      const result = classifyContent("Trump's Trade War: An Economic Analysis");
      expect(result.isTechnical).toBe(false);
    });

    it('classifies clearly technical AI content as technical', () => {
      expect(isTechnicalContent('Deep Learning Neural Network Architecture')).toBe(true);
      expect(isTechnicalContent('Machine Learning Model Training Pipeline')).toBe(true);
    });
  });
});
