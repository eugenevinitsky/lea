// BOW classifier to filter Substack posts for technical/intellectual content

// Technical/intellectual keywords (positive signals)
const TECHNICAL_KEYWORDS = [
  // Technology
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
  'programming', 'software', 'engineering', 'algorithm', 'data', 'api',
  'code', 'coding', 'developer', 'tech', 'startup', 'product', 'database',
  'cloud', 'infrastructure', 'architecture', 'system', 'computer', 'computing',
  'neural network', 'llm', 'gpt', 'transformer', 'model', 'training',

  // Science
  'research', 'study', 'experiment', 'hypothesis', 'science', 'scientific',
  'physics', 'biology', 'chemistry', 'neuroscience', 'psychology', 'cognitive',
  'mathematics', 'math', 'statistics', 'statistical', 'quantum', 'genomics',
  'climate', 'evolution', 'brain', 'medical', 'health', 'clinical',

  // Business/Startup/Economics
  'founder', 'venture', 'investment', 'growth', 'metrics', 'strategy',
  'market', 'economics', 'economic', 'finance', 'financial', 'business',
  'entrepreneur', 'innovation', 'scale', 'revenue', 'pricing',

  // Academia
  'paper', 'publication', 'peer-review', 'academic', 'professor', 'university',
  'journal', 'thesis', 'dissertation', 'scholar', 'lecture',

  // Philosophy/Ideas
  'philosophy', 'philosophical', 'theory', 'framework', 'concept', 'analysis',
  'rationality', 'epistemology', 'ethics', 'logic', 'reasoning',

  // Writing/Media craft
  'writing', 'essay', 'book review', 'literature', 'critique', 'narrative',
];

// Political keywords (negative signals)
const POLITICAL_KEYWORDS = [
  // Politicians (US)
  'trump', 'biden', 'harris', 'pelosi', 'mcconnell', 'aoc', 'desantis',
  'obama', 'clinton', 'pence', 'schumer', 'mccarthy', 'newsom', 'sanders',
  'warren', 'cruz', 'rubio', 'maga', 'musk',

  // Political parties/movements
  'democrat', 'democrats', 'democratic party', 'republican', 'republicans',
  'gop', 'liberal', 'liberals', 'conservative', 'conservatives',
  'progressive', 'progressives', 'maga', 'woke', 'antifa', 'alt-right',

  // Political processes
  'election', 'elections', 'vote', 'voting', 'ballot', 'poll', 'polls',
  'congress', 'senate', 'house of representatives', 'legislation', 'bill',
  'partisan', 'bipartisan', 'caucus', 'filibuster', 'impeach', 'impeachment',

  // Hot-button political topics (when framed politically)
  'immigration', 'border', 'abortion', 'pro-life', 'pro-choice',
  'gun control', 'second amendment', '2nd amendment', 'nra',
  'january 6', 'jan 6', 'insurrection', 'coup',

  // Political media/rhetoric
  'fox news', 'msnbc', 'cnn', 'breitbart', 'huffpost',
  'left-wing', 'right-wing', 'far-left', 'far-right',
  'outrage', 'slam', 'blasts', 'rips', 'destroys', 'owns',
];

// Helper to check if keyword exists as a word (not substring)
function hasKeyword(text: string, keyword: string): boolean {
  // For multi-word keywords, use simple includes
  if (keyword.includes(' ')) {
    return text.includes(keyword);
  }
  // For single words, use word boundary matching
  const regex = new RegExp(`\\b${keyword}\\b`, 'i');
  return regex.test(text);
}

/**
 * Check if content is technical/intellectual vs political
 * @param title - The title of the Substack post
 * @param description - Optional description/summary
 * @returns true if content appears technical, false if political
 */
export function isTechnicalContent(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();

  let technicalScore = 0;
  let politicalScore = 0;

  // Count technical keywords
  for (const keyword of TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      technicalScore++;
    }
  }

  // Count political keywords
  for (const keyword of POLITICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      politicalScore++;
    }
  }

  // Scoring logic:
  // - Technical keywords count positively (weight 2)
  // - Political keywords count negatively (weight 3)
  // - If no keywords found at all, reject (likely general interest)
  const score = (technicalScore * 2) - (politicalScore * 3);

  // Accept if:
  // 1. Score is positive (more technical than political)
  // 2. OR has technical keywords and no political keywords
  // 3. AND has at least some technical signal
  if (technicalScore > 0 && politicalScore === 0) {
    return true;
  }

  if (score > 0) {
    return true;
  }

  return false;
}

/**
 * Get classification details for debugging
 */
export function classifyContent(title: string, description?: string): {
  isTechnical: boolean;
  technicalScore: number;
  politicalScore: number;
  matchedTechnical: string[];
  matchedPolitical: string[];
} {
  const text = `${title} ${description || ''}`.toLowerCase();

  const matchedTechnical: string[] = [];
  const matchedPolitical: string[] = [];

  for (const keyword of TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      matchedTechnical.push(keyword);
    }
  }

  for (const keyword of POLITICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      matchedPolitical.push(keyword);
    }
  }

  const technicalScore = matchedTechnical.length;
  const politicalScore = matchedPolitical.length;
  const score = (technicalScore * 2) - (politicalScore * 3);

  const isTechnical = (technicalScore > 0 && politicalScore === 0) || score > 0;

  return {
    isTechnical,
    technicalScore,
    politicalScore,
    matchedTechnical,
    matchedPolitical,
  };
}
