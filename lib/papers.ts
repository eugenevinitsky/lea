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

/**
 * Extract paper URL from post text and embed
 * Returns the first paper URL found
 */
export function extractPaperUrl(text: string, embedUri?: string): string | null {
  // Check embed first (more reliable)
  if (embedUri) {
    for (const domain of PAPER_DOMAINS) {
      if (embedUri.toLowerCase().includes(domain)) {
        return embedUri;
      }
    }
  }

  // Check text for URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) || [];
  
  for (const url of urls) {
    for (const domain of PAPER_DOMAINS) {
      if (url.toLowerCase().includes(domain)) {
        return url;
      }
    }
  }

  return null;
}

/**
 * Generate a URL-safe paper ID from a paper URL
 * This normalizes URLs to create consistent IDs
 */
export function getPaperIdFromUrl(url: string): string {
  // For arXiv, use the arXiv ID
  const arxivId = extractArxivId(url);
  if (arxivId) {
    return `arxiv:${arxivId}`;
  }

  // For DOI URLs, extract the DOI
  const doiMatch = url.match(/(?:doi\.org\/|dx\.doi\.org\/)(10\.[^\s&?#]+)/i);
  if (doiMatch) {
    // URL-encode the DOI for safe use in URLs
    return `doi:${encodeURIComponent(doiMatch[1])}`;
  }

  // For other URLs, create a hash-like ID from the URL
  // Remove protocol, trailing slashes, and query params for consistency
  let normalized = url
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '');
  
  // URL-encode the entire thing for safe use
  return `url:${encodeURIComponent(normalized)}`;
}

/**
 * Get the display URL for a paper ID
 */
export function getUrlFromPaperId(paperId: string): string {
  if (paperId.startsWith('arxiv:')) {
    return `https://arxiv.org/abs/${paperId.slice(6)}`;
  }
  if (paperId.startsWith('doi:')) {
    return `https://doi.org/${decodeURIComponent(paperId.slice(4))}`;
  }
  if (paperId.startsWith('url:')) {
    return `https://${decodeURIComponent(paperId.slice(4))}`;
  }
  // Fallback - assume it's a raw URL
  return paperId;
}

/**
 * Get the search query to find posts about a paper
 */
export function getSearchQueryForPaper(paperId: string): string {
  if (paperId.startsWith('arxiv:')) {
    // Search for arXiv URL pattern
    return `arxiv.org/abs/${paperId.slice(6)}`;
  }
  if (paperId.startsWith('doi:')) {
    // Search for DOI
    const doi = decodeURIComponent(paperId.slice(4));
    return doi;
  }
  if (paperId.startsWith('url:')) {
    // Search for the domain + path
    const urlPath = decodeURIComponent(paperId.slice(4));
    // Use just the path portion for better search results
    return urlPath;
  }
  return paperId;
}

/**
 * Get paper type label from paper ID
 */
export function getPaperTypeFromId(paperId: string): string {
  if (paperId.startsWith('arxiv:')) return 'arXiv';
  if (paperId.startsWith('doi:')) return 'DOI';
  
  // For URL-based IDs, determine type from the URL
  if (paperId.startsWith('url:')) {
    const url = decodeURIComponent(paperId.slice(4));
    for (const domain of PAPER_DOMAINS) {
      if (url.includes(domain)) {
        return getPaperLabel(domain);
      }
    }
  }
  
  return 'Paper';
}
