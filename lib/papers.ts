// Paper link detection utilities

export const PAPER_DOMAINS = [
  'arxiv.org',
  'doi.org',
  'semanticscholar.org',
  'aclanthology.org',
  'openreview.net',
  'biorxiv.org',
  'medrxiv.org',
  'ssrn.com',
  'nature.com',
  'science.org',
  'sciencemag.org',
  'pnas.org',
  'acm.org',
  'dl.acm.org',
  'ieee.org',
  'ieeexplore.ieee.org',
  'springer.com',
  'link.springer.com',
  'wiley.com',
  'onlinelibrary.wiley.com',
  'plos.org',
  'journals.plos.org',
  'cell.com',
  'sciencedirect.com',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
];

export interface PaperDetectionResult {
  hasPaper: boolean;
  domain?: string;
  label?: string;
}

export function detectPaperLink(text: string, embedUri?: string): PaperDetectionResult {
  const lowerText = text.toLowerCase();
  const lowerEmbed = embedUri?.toLowerCase() || '';

  for (const domain of PAPER_DOMAINS) {
    if (lowerText.includes(domain) || lowerEmbed.includes(domain)) {
      return {
        hasPaper: true,
        domain,
        label: getPaperLabel(domain),
      };
    }
  }

  return { hasPaper: false };
}

export function getPaperLabel(domain: string): string {
  if (domain.includes('arxiv')) return 'arXiv';
  if (domain.includes('doi.org')) return 'DOI';
  if (domain.includes('semanticscholar')) return 'S2';
  if (domain.includes('biorxiv')) return 'bioRxiv';
  if (domain.includes('medrxiv')) return 'medRxiv';
  if (domain.includes('aclanthology')) return 'ACL';
  if (domain.includes('openreview')) return 'OpenReview';
  if (domain.includes('nature.com')) return 'Nature';
  if (domain.includes('science.org') || domain.includes('sciencemag')) return 'Science';
  if (domain.includes('pnas')) return 'PNAS';
  if (domain.includes('acm.org')) return 'ACM';
  if (domain.includes('ieee')) return 'IEEE';
  if (domain.includes('springer')) return 'Springer';
  if (domain.includes('wiley')) return 'Wiley';
  if (domain.includes('plos')) return 'PLOS';
  if (domain.includes('cell.com')) return 'Cell';
  if (domain.includes('pubmed') || domain.includes('ncbi')) return 'PubMed';
  if (domain.includes('ssrn')) return 'SSRN';
  return 'Paper';
}

/**
 * Extract arXiv ID from a URL or text
 * Supports formats:
 * - arxiv.org/abs/2312.12345
 * - arxiv.org/pdf/2312.12345
 * - arxiv.org/abs/2312.12345v1
 * - Old format: arxiv.org/abs/hep-th/9901001
 */
export function extractArxivId(input: string): string | null {
  // New format: YYMM.NNNNN (with optional version)
  const newFormatMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/([\d.]+(?:v\d+)?)/i);
  if (newFormatMatch) {
    // Remove version suffix for consistent ID
    return newFormatMatch[1].replace(/v\d+$/, '');
  }

  // Old format: category/YYMMNNN
  const oldFormatMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/([a-z-]+\/\d+)/i);
  if (oldFormatMatch) {
    return oldFormatMatch[1];
  }

  // Also check for bare arXiv IDs in text (e.g., "arXiv:2312.12345")
  const bareIdMatch = input.match(/arXiv:([\d.]+(?:v\d+)?)/i);
  if (bareIdMatch) {
    return bareIdMatch[1].replace(/v\d+$/, '');
  }

  return null;
}

/**
 * Extract arXiv ID from post text and embed
 */
export function extractArxivIdFromPost(text: string, embedUri?: string): string | null {
  // Check embed first (more reliable)
  if (embedUri) {
    const embedId = extractArxivId(embedUri);
    if (embedId) return embedId;
  }

  // Check text
  return extractArxivId(text);
}

/**
 * Get arXiv URL from ID
 */
export function getArxivUrl(arxivId: string): string {
  return `https://arxiv.org/abs/${arxivId}`;
}
