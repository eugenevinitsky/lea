// BOW classifier to filter Substack posts for technical/intellectual content

// STRONG technical keywords - one match is sufficient
// These are unambiguously technical/scientific terms
const STRONG_TECHNICAL_KEYWORDS = [
  // AI/ML (very specific)
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
  'neural network', 'llm', 'gpt', 'transformer', 'chatgpt', 'openai',

  // Programming (very specific)
  'programming', 'algorithm', 'api', 'database', 'software engineering',
  'code', 'coding', 'github', 'python', 'javascript', 'typescript',

  // Hard sciences (very specific)
  'physics', 'biology', 'chemistry', 'neuroscience', 'quantum',
  'genomics', 'mathematics', 'statistics', 'calculus',

  // Academia (specific)
  'peer-review', 'dissertation', 'arxiv',
];

// WEAK technical keywords - need 2+ matches or 1 strong + 1 weak
// These can appear in non-technical contexts
const WEAK_TECHNICAL_KEYWORDS = [
  // Tech (could be generic)
  'software', 'developer', 'tech', 'startup', 'data', 'model', 'training',
  'cloud', 'infrastructure', 'system', 'computer', 'computing', 'engineering',

  // Science (could be generic)
  'research', 'study', 'experiment', 'hypothesis', 'science', 'scientific',
  'psychology', 'cognitive', 'climate', 'evolution', 'brain', 'medical', 'clinical',

  // Business/Economics
  'founder', 'venture', 'investment', 'metrics',
  'economics', 'economic', 'finance', 'financial',
  'entrepreneur', 'innovation', 'revenue', 'pricing',

  // Academia
  'paper', 'academic', 'professor', 'university',
  'journal', 'thesis', 'scholar', 'lecture',

  // Philosophy/Ideas
  'philosophy', 'philosophical', 'theory', 'framework', 'concept', 'analysis',
  'rationality', 'epistemology', 'ethics', 'logic', 'reasoning',

  // Writing/Media craft (specific)
  'book review', 'literature', 'critique',
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

  let strongCount = 0;
  let weakCount = 0;
  let politicalScore = 0;

  // Count strong technical keywords
  for (const keyword of STRONG_TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      strongCount++;
    }
  }

  // Count weak technical keywords
  for (const keyword of WEAK_TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      weakCount++;
    }
  }

  // Count political keywords
  for (const keyword of POLITICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      politicalScore++;
    }
  }

  const totalTechnical = strongCount + weakCount;

  // Scoring logic:
  // - 1 strong keyword is enough (unambiguously technical)
  // - 2+ weak keywords is enough (corroborating evidence)
  // - 1 strong + 1 weak is enough
  // - Political keywords still count negatively

  // If any political keywords, need stronger technical signal
  if (politicalScore > 0) {
    const score = (totalTechnical * 2) - (politicalScore * 3);
    return score > 0 && (strongCount >= 1 || weakCount >= 2);
  }

  // No political keywords - accept if:
  // 1. At least 1 strong keyword, OR
  // 2. At least 2 weak keywords
  return strongCount >= 1 || weakCount >= 2;
}

/**
 * Get classification details for debugging
 */
export function classifyContent(title: string, description?: string): {
  isTechnical: boolean;
  strongCount: number;
  weakCount: number;
  politicalScore: number;
  matchedStrong: string[];
  matchedWeak: string[];
  matchedPolitical: string[];
} {
  const text = `${title} ${description || ''}`.toLowerCase();

  const matchedStrong: string[] = [];
  const matchedWeak: string[] = [];
  const matchedPolitical: string[] = [];

  for (const keyword of STRONG_TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      matchedStrong.push(keyword);
    }
  }

  for (const keyword of WEAK_TECHNICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      matchedWeak.push(keyword);
    }
  }

  for (const keyword of POLITICAL_KEYWORDS) {
    if (hasKeyword(text, keyword)) {
      matchedPolitical.push(keyword);
    }
  }

  const strongCount = matchedStrong.length;
  const weakCount = matchedWeak.length;
  const politicalScore = matchedPolitical.length;
  const totalTechnical = strongCount + weakCount;

  let isTechnical: boolean;
  if (politicalScore > 0) {
    const score = (totalTechnical * 2) - (politicalScore * 3);
    isTechnical = score > 0 && (strongCount >= 1 || weakCount >= 2);
  } else {
    isTechnical = strongCount >= 1 || weakCount >= 2;
  }

  return {
    isTechnical,
    strongCount,
    weakCount,
    politicalScore,
    matchedStrong,
    matchedWeak,
    matchedPolitical,
  };
}
