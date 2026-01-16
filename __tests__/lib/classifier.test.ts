import { describe, it, expect } from 'vitest';
import { isTechnicalContent, classifyContent, getModelInfo } from '@/lib/substack-classifier';

describe('Substack Classifier', () => {
  describe('getModelInfo', () => {
    it('reports model is loaded', () => {
      const info = getModelInfo();
      expect(info.loaded).toBe(true);
      expect(info.type).toBe('naive-bayes');
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
      expect(isTechnicalContent('Celebrity Gossip Weekly')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(isTechnicalContent('')).toBe(false);
      expect(isTechnicalContent('   ')).toBe(false);
    });

    it('handles description parameter', () => {
      // Technical title with technical description
      expect(isTechnicalContent('Research Paper', 'A study on neural networks')).toBe(true);

      // Non-technical title alone might be ambiguous, but with political description
      expect(isTechnicalContent('Weekly Update', 'Latest news on the election campaign')).toBe(false);
    });
  });

  describe('classifyContent', () => {
    it('returns detailed classification info', () => {
      const result = classifyContent('Deep Learning for Computer Vision');

      expect(result.modelLoaded).toBe(true);
      expect(result.prediction).toBe('technical');
      expect(result.isTechnical).toBe(true);
      expect(result.scores).toHaveProperty('technical');
      expect(result.scores).toHaveProperty('non-technical');
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.normalizedMargin).toBeDefined();
    });

    it('returns correct structure for non-technical content', () => {
      const result = classifyContent('Trump Republican Democrat Election Campaign');

      expect(result.modelLoaded).toBe(true);
      expect(result.prediction).toBe('non-technical');
      expect(result.isTechnical).toBe(false);
    });

    it('includes token list', () => {
      const result = classifyContent('Machine Learning');

      expect(result.tokens).toContain('machine');
      expect(result.tokens).toContain('learning');
    });

    it('handles empty input', () => {
      const result = classifyContent('');

      expect(result.isTechnical).toBe(false);
      expect(result.tokens).toHaveLength(0);
    });
  });

  describe('borderline cases', () => {
    // These tests document expected behavior for edge cases
    // If the model changes, these might need to be updated

    it('classifies AI + politics mix based on dominant signal', () => {
      // Technical framing should win
      const result1 = classifyContent('The Neuroscience of Political Polarization');
      expect(result1.isTechnical).toBe(true);

      // Political framing should win
      const result2 = classifyContent("Trump's Trade War: An Economic Analysis");
      expect(result2.isTechnical).toBe(false);
    });

    it('classifies science journalism correctly', () => {
      expect(isTechnicalContent('The Science Behind Polling Accuracy')).toBe(true);
      expect(isTechnicalContent('Data Privacy in the Age of Surveillance')).toBe(true);
    });
  });
});
