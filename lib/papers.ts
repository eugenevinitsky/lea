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
 * Facet type for link extraction
 */
export interface LinkFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string }>;
}

/**
 * Extract ANY URL from post text, embed, and facets (no domain filtering)
 * Used for posts from Paper Skygest where we trust the feed's curation
 * Returns the first URL found
 */
export function extractAnyUrl(text: string, embedUri?: string, facets?: LinkFacet[]): string | null {
  // Check embed first (most reliable)
  if (embedUri) {
    return embedUri;
  }

  // Check facets for link URIs (second most reliable)
  if (facets) {
    for (const facet of facets) {
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          return feature.uri;
        }
      }
    }
  }

  // Check text for URLs (fallback)
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex);
  if (urls && urls.length > 0) {
    return urls[0];
  }

  return null;
}

/**
 * Extract paper URL from post text, embed, and facets
 * Returns the first paper URL found (filtered by known paper domains)
 */
export function extractPaperUrl(text: string, embedUri?: string, facets?: LinkFacet[]): string | null {
  // Check embed first (most reliable)
  if (embedUri) {
    for (const domain of PAPER_DOMAINS) {
      if (embedUri.toLowerCase().includes(domain)) {
        return embedUri;
      }
    }
  }

  // Check facets for link URIs (second most reliable - contains full URLs even when text is truncated)
  if (facets) {
    for (const facet of facets) {
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          for (const domain of PAPER_DOMAINS) {
            if (feature.uri.toLowerCase().includes(domain)) {
              return feature.uri;
            }
          }
        }
      }
    }
  }

  // Check text for URLs (fallback)
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

  // For OpenReview, extract the forum ID
  const openreviewMatch = url.match(/openreview\.net\/(?:forum|pdf)\?id=([a-zA-Z0-9_-]+)/i);
  if (openreviewMatch) {
    return `openreview:${openreviewMatch[1]}`;
  }

  // For DOI URLs, extract the DOI
  // Match doi.org, dx.doi.org, or embedded DOIs in publisher URLs
  const doiPatterns = [
    // Direct DOI URLs
    /(?:doi\.org\/|dx\.doi\.org\/)(10\.[^\s&?#]+)/i,
    // ACM Digital Library: dl.acm.org/doi/[abs/full/pdf/]10.1145/xxx
    /dl\.acm\.org\/doi\/(?:abs\/|full\/|pdf\/)?(?:epdf\/)?(10\.\d+\/[^\s?#]+)/i,
    // Wiley: onlinelibrary.wiley.com/doi/[full/abs/]10.xxxx/xxx or subdomain.onlinelibrary.wiley.com
    /onlinelibrary\.wiley\.com\/doi\/(?:abs\/|full\/|epdf\/|pdf\/)?(10\.\d+\/[^\s?#]+)/i,
    // Science.org: science.org/doi/10.1126/xxx
    /science\.org\/doi\/(10\.\d+\/[^\s?#]+)/i,
    // Springer/Nature: link.springer.com/article/10.xxxx/xxx
    /link\.springer\.com\/article\/(10\.\d+\/[^\s?#]+)/i,
    // PNAS: pnas.org/doi/10.xxxx/xxx
    /pnas\.org\/doi\/(10\.\d+\/[^\s?#]+)/i,
    // Taylor & Francis: tandfonline.com/doi/[abs/full/]10.xxxx/xxx
    /tandfonline\.com\/doi\/(?:abs\/|full\/)?(10\.\d+\/[^\s?#]+)/i,
    // PLOS: journals.plos.org/xxx/article?id=10.1371/xxx
    /journals\.plos\.org\/.*[?&]id=(10\.\d+\/[^\s?#&]+)/i,
    // Generic DOI in path
    /\/(?:doi|article)\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\.\d+\/[^\s?#]+)/i,
  ];
  
  for (const pattern of doiPatterns) {
    const doiMatch = url.match(pattern);
    if (doiMatch) {
      // Clean up the DOI - remove trailing punctuation that might have been captured
      const cleanDoi = doiMatch[1].replace(/[.,;:]+$/, '');
      return `doi:${encodeURIComponent(cleanDoi)}`;
    }
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
  if (paperId.startsWith('openreview:')) {
    return `https://openreview.net/forum?id=${paperId.slice(11)}`;
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
 * Returns a simplified query that works well with Bluesky's search
 */
export function getSearchQueryForPaper(paperId: string): string {
  if (paperId.startsWith('arxiv:')) {
    // Search for arXiv ID - this works well
    const arxivId = paperId.slice(6);
    return `arxiv ${arxivId}`;
  }
  if (paperId.startsWith('openreview:')) {
    // Search for OpenReview forum ID
    const forumId = paperId.slice(11);
    return `openreview ${forumId}`;
  }
  if (paperId.startsWith('doi:')) {
    // Search for DOI - use the numeric part
    const doi = decodeURIComponent(paperId.slice(4));
    return doi;
  }
  if (paperId.startsWith('url:')) {
    // For URL-based papers, extract the most identifying part
    const urlPath = decodeURIComponent(paperId.slice(4));
    
    // Try to extract article/paper ID from common URL patterns
    // Nature: nature.com/articles/s41586-024-12345
    const natureMatch = urlPath.match(/nature\.com\/articles\/([a-z0-9-]+)/i);
    if (natureMatch) return `nature ${natureMatch[1]}`;
    
    // Science: science.org/doi/10.1126/science.xxx
    const scienceDoiMatch = urlPath.match(/science\.org\/doi\/(10\.[^/]+\/[^/?]+)/i);
    if (scienceDoiMatch) return scienceDoiMatch[1];
    
    // ACL Anthology: aclanthology.org/2024.acl-long.123
    const aclMatch = urlPath.match(/aclanthology\.org\/([A-Z0-9.-]+)/i);
    if (aclMatch) return `aclanthology ${aclMatch[1]}`;
    
    // OpenReview: openreview.net/forum?id=xxx
    const openreviewMatch = urlPath.match(/openreview\.net.*[?&]id=([^&]+)/i);
    if (openreviewMatch) return `openreview ${openreviewMatch[1]}`;
    
    // Semantic Scholar: semanticscholar.org/paper/xxx
    const s2Match = urlPath.match(/semanticscholar\.org\/paper\/[^/]*\/([a-f0-9]+)/i);
    if (s2Match) return s2Match[1];
    
    // PubMed: pubmed.ncbi.nlm.nih.gov/12345678
    const pubmedMatch = urlPath.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
    if (pubmedMatch) return `pubmed ${pubmedMatch[1]}`;
    
    // bioRxiv/medRxiv: biorxiv.org/content/10.1101/2024.01.01.123456
    const biorxivMatch = urlPath.match(/(bio|med)rxiv\.org\/content\/(10\.\d+\/[^/?]+)/i);
    if (biorxivMatch) return biorxivMatch[2];
    
    // IEEE: ieeexplore.ieee.org/document/12345678
    const ieeeMatch = urlPath.match(/ieeexplore\.ieee\.org\/document\/(\d+)/i);
    if (ieeeMatch) return `ieee ${ieeeMatch[1]}`;
    
    // ACM: dl.acm.org/doi/10.1145/xxx
    const acmMatch = urlPath.match(/dl\.acm\.org\/doi\/(10\.[^/?]+)/i);
    if (acmMatch) return acmMatch[1];
    
    // Springer: link.springer.com/article/10.1007/xxx
    const springerMatch = urlPath.match(/link\.springer\.com\/article\/(10\.[^/?]+)/i);
    if (springerMatch) return springerMatch[1];
    
    // For other URLs, try to use the domain + key path segment
    // This is a fallback that might not work as well
    const parts = urlPath.split('/');
    const domain = parts[0];
    // Get the last meaningful path segment (skip common words)
    const meaningfulParts = parts.slice(1).filter(p => 
      p && !['article', 'articles', 'paper', 'papers', 'doi', 'abs', 'pdf', 'full', 'content'].includes(p.toLowerCase())
    );
    if (meaningfulParts.length > 0) {
      return `${domain.split('.')[0]} ${meaningfulParts[meaningfulParts.length - 1]}`;
    }
    
    return urlPath;
  }
  return paperId;
}

/**
 * Get paper type label from paper ID
 */
export function getPaperTypeFromId(paperId: string): string {
  if (paperId.startsWith('arxiv:')) return 'arXiv';
  if (paperId.startsWith('openreview:')) return 'OpenReview';
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
