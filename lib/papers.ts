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
