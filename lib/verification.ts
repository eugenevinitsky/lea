import { OpenAlexAuthor, OpenAlexWork } from './openalex';

// Established venues for auto-approval
// Works at these venues count toward the 3-work requirement
export const ESTABLISHED_VENUES: Record<string, string[]> = {
  // NLP/CL
  'NLP': [
    'acl', 'emnlp', 'naacl', 'eacl', 'coling', 'conll',
    'tacl', 'computational linguistics',
    'findings of acl', 'findings of emnlp', 'findings of naacl',
  ],
  // ML/AI
  'ML/AI': [
    'neurips', 'nips', 'icml', 'iclr', 'aaai', 'ijcai',
    'jmlr', 'journal of machine learning research',
    'artificial intelligence', 'machine learning',
  ],
  // HCI
  'HCI': [
    'chi', 'cscw', 'uist', 'ubicomp', 'imwut',
    'human-computer interaction', 'computer supported cooperative work',
  ],
  // Computer Vision
  'Vision': [
    'cvpr', 'iccv', 'eccv',
    'ieee transactions on pattern analysis',
  ],
  // Other CS
  'CS': [
    'sigir', 'www', 'icse', 'sosp', 'osdi', 'sigcomm',
    'sigmod', 'vldb', 'kdd', 'wsdm', 'recsys',
    'ieee transactions on', 'acm transactions on',
  ],
  // General Science
  'Science': [
    'nature', 'science', 'pnas', 'proceedings of the national academy',
    'cell', 'lancet', 'nejm', 'new england journal of medicine',
    'plos one', 'plos biology',
  ],
  // Social Science
  'Social Science': [
    'american sociological review', 'american journal of sociology',
    'american political science review', 'political analysis',
    'american economic review', 'quarterly journal of economics',
    'psychological science', 'journal of personality and social psychology',
  ],
  // Digital Humanities
  'Digital Humanities': [
    'digital humanities', 'digital scholarship in the humanities',
    'journal of cultural analytics',
  ],
};

// Flatten venues for easy lookup
const ALL_VENUES = Object.values(ESTABLISHED_VENUES).flat();

export interface VerificationResult {
  eligible: boolean;
  reason: string;
  details: {
    totalWorks: number;
    establishedVenueWorks: number;
    recentWorks: number; // Works in last 5 years
    matchedVenues: string[];
    topVenues: string[];
    institution?: string;
    fields: string[];
  };
}

// Check if a venue name matches our established venues list
function matchesEstablishedVenue(venueName: string): boolean {
  if (!venueName) return false;
  const lower = venueName.toLowerCase();
  return ALL_VENUES.some(venue => lower.includes(venue.toLowerCase()));
}

// Get the category of a matched venue
function getVenueCategory(venueName: string): string | null {
  if (!venueName) return null;
  const lower = venueName.toLowerCase();

  for (const [category, venues] of Object.entries(ESTABLISHED_VENUES)) {
    if (venues.some(v => lower.includes(v.toLowerCase()))) {
      return category;
    }
  }
  return null;
}

// Calculate verification eligibility
export function checkVerificationEligibility(
  author: OpenAlexAuthor,
  works: OpenAlexWork[]
): VerificationResult {
  const currentYear = new Date().getFullYear();
  const fiveYearsAgo = currentYear - 5;

  // Track venues and recent works
  const matchedVenues: string[] = [];
  const venueCount: Record<string, number> = {};
  let establishedVenueWorks = 0;
  let recentWorks = 0;

  for (const work of works) {
    const venueName = work.primary_location?.source?.display_name || '';
    const isRecent = work.publication_year >= fiveYearsAgo;

    if (isRecent) {
      recentWorks++;
    }

    if (matchesEstablishedVenue(venueName)) {
      establishedVenueWorks++;
      if (!matchedVenues.includes(venueName)) {
        matchedVenues.push(venueName);
      }
      venueCount[venueName] = (venueCount[venueName] || 0) + 1;
    }
  }

  // Get top venues by count
  const topVenues = Object.entries(venueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([venue]) => venue);

  // Extract fields from topics
  const fields = new Set<string>();
  for (const work of works.slice(0, 10)) {
    if (work.topics) {
      for (const topic of work.topics.slice(0, 2)) {
        fields.add(topic.field?.display_name || topic.subfield?.display_name || '');
      }
    }
  }

  const details = {
    totalWorks: author.works_count,
    establishedVenueWorks,
    recentWorks,
    matchedVenues,
    topVenues,
    institution: author.last_known_institution?.display_name,
    fields: Array.from(fields).filter(Boolean).slice(0, 5),
  };

  // Check eligibility criteria
  // Criterion 1: At least 3 works at established venues
  if (establishedVenueWorks < 3) {
    return {
      eligible: false,
      reason: `Found ${establishedVenueWorks} work(s) at established venues (need 3+). You may still qualify through vouching.`,
      details,
    };
  }

  // Criterion 2: At least 1 work in the last 5 years
  if (recentWorks < 1) {
    return {
      eligible: false,
      reason: `No publications found in the last 5 years. You may still qualify through vouching.`,
      details,
    };
  }

  // All criteria met!
  return {
    eligible: true,
    reason: `Eligible for auto-approval! Found ${establishedVenueWorks} works at established venues with recent activity.`,
    details,
  };
}

// Extract research topics from works for storage
// Returns a deduplicated list of topic names at different levels of specificity
export function extractResearchTopics(works: OpenAlexWork[]): string[] {
  const topicCounts = new Map<string, number>();

  for (const work of works) {
    if (work.topics) {
      for (const topic of work.topics) {
        // Add topic name (most specific)
        if (topic.display_name) {
          topicCounts.set(topic.display_name, (topicCounts.get(topic.display_name) || 0) + 1);
        }
        // Add subfield (medium specificity)
        if (topic.subfield?.display_name) {
          topicCounts.set(topic.subfield.display_name, (topicCounts.get(topic.subfield.display_name) || 0) + 1);
        }
        // Add field (broad category)
        if (topic.field?.display_name) {
          topicCounts.set(topic.field.display_name, (topicCounts.get(topic.field.display_name) || 0) + 1);
        }
      }
    }
  }

  // Sort by count and return top topics (limit to 20 to keep it manageable)
  return Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic]) => topic);
}

// Get display-friendly summary of verification status
export function getVerificationSummary(result: VerificationResult): string {
  const { details } = result;

  let summary = `**${details.totalWorks}** total works`;

  if (details.institution) {
    summary += ` at ${details.institution}`;
  }

  summary += `\n\n`;
  summary += `- ${details.establishedVenueWorks} at established venues\n`;
  summary += `- ${details.recentWorks} in the last 5 years\n`;

  if (details.topVenues.length > 0) {
    summary += `\nTop venues: ${details.topVenues.join(', ')}`;
  }

  if (details.fields.length > 0) {
    summary += `\n\nFields: ${details.fields.join(', ')}`;
  }

  return summary;
}
