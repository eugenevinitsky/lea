import { NextRequest, NextResponse } from 'next/server';

// Extract DOI from various paper URLs
function extractDoi(url: string): string | null {
  const lowerUrl = url.toLowerCase();

  // Direct DOI URL
  if (lowerUrl.includes('doi.org/')) {
    const match = url.match(/doi\.org\/(.+?)(?:\?|#|$)/i);
    return match ? match[1] : null;
  }

  // bioRxiv/medRxiv
  if (lowerUrl.includes('biorxiv.org') || lowerUrl.includes('medrxiv.org')) {
    // Format: https://www.biorxiv.org/content/10.1101/2024.01.01.123456v1
    const match = url.match(/content\/(10\.\d{4,}\/[^\s?#]+)/i);
    if (match) {
      // Strip version suffix
      return match[1].replace(/v\d+$/i, '');
    }
  }

  // Nature
  if (lowerUrl.includes('nature.com')) {
    const match = url.match(/nature\.com\/articles\/([^?#]+)/i);
    if (match) {
      return `10.1038/${match[1]}`;
    }
  }

  // Science
  if (lowerUrl.includes('science.org')) {
    const match = url.match(/science\.org\/doi\/(10\.[^?#]+)/i);
    return match ? match[1] : null;
  }

  // PNAS
  if (lowerUrl.includes('pnas.org')) {
    const match = url.match(/pnas\.org\/doi\/(10\.[^?#]+)/i);
    return match ? match[1] : null;
  }

  return null;
}

// Extract arXiv ID
function extractArxivId(url: string): string | null {
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return match ? match[1].replace(/v\d+$/, '') : null;
}

// Extract PubMed ID
function extractPubmedId(url: string): string | null {
  const match = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return match ? match[1] : null;
}

// Fetch metadata from DOI
async function fetchDoiMetadata(doi: string): Promise<{ title?: string; authors?: string[]; journal?: string; year?: number } | null> {
  try {
    // Try DOI content negotiation first
    const response = await fetch(`https://doi.org/${doi}`, {
      headers: {
        'Accept': 'application/vnd.citationstyles.csl+json',
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)'
      },
      redirect: 'follow'
    });

    if (response.ok) {
      const data = await response.json();
      return {
        title: data?.title,
        authors: data?.author?.map((a: { given?: string; family?: string }) =>
          `${a.given || ''} ${a.family || ''}`.trim()
        ).filter(Boolean),
        journal: data?.['container-title'],
        year: data?.issued?.['date-parts']?.[0]?.[0]
      };
    }

    // Fallback to CrossRef
    const crossrefResponse = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'Lea/1.0 (mailto:support@lea.community)' }
    });

    if (!crossrefResponse.ok) return null;

    const data = await crossrefResponse.json();
    const work = data.message;
    return {
      title: work?.title?.[0],
      authors: work?.author?.map((a: { given?: string; family?: string }) =>
        `${a.given || ''} ${a.family || ''}`.trim()
      ).filter(Boolean),
      journal: work?.['container-title']?.[0],
      year: work?.issued?.['date-parts']?.[0]?.[0]
    };
  } catch (e) {
    console.error('Failed to fetch DOI metadata:', e);
    return null;
  }
}

// Fetch metadata from arXiv
async function fetchArxivMetadata(arxivId: string): Promise<{ title?: string; authors?: string[]; journal?: string; year?: number } | null> {
  try {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
    if (!response.ok) return null;

    const xml = await response.text();
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;

    const entry = entryMatch[1];
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ');

    const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
    const authors = Array.from(authorMatches).map(m => m[1].trim());

    const publishedMatch = entry.match(/<published>(\d{4})/);
    const year = publishedMatch ? parseInt(publishedMatch[1]) : undefined;

    return { title, authors: authors.length > 0 ? authors : undefined, journal: 'arXiv', year };
  } catch (e) {
    console.error('Failed to fetch arXiv metadata:', e);
    return null;
  }
}

// Fetch metadata from PubMed
async function fetchPubmedMetadata(pmid: string): Promise<{ title?: string; authors?: string[]; journal?: string; year?: number } | null> {
  try {
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const result = data.result?.[pmid];

    return {
      title: result?.title,
      authors: result?.authors?.map((a: { name: string }) => a.name),
      journal: result?.source,
      year: result?.pubdate ? parseInt(result.pubdate.split(' ')[0]) : undefined
    };
  } catch (e) {
    console.error('Failed to fetch PubMed metadata:', e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    // Try to extract identifiers and fetch metadata
    const doi = extractDoi(url);
    if (doi) {
      const metadata = await fetchDoiMetadata(doi);
      if (metadata) {
        return NextResponse.json({ ...metadata, source: 'doi', id: doi });
      }
    }

    const arxivId = extractArxivId(url);
    if (arxivId) {
      const metadata = await fetchArxivMetadata(arxivId);
      if (metadata) {
        return NextResponse.json({ ...metadata, source: 'arxiv', id: arxivId });
      }
    }

    const pmid = extractPubmedId(url);
    if (pmid) {
      const metadata = await fetchPubmedMetadata(pmid);
      if (metadata) {
        return NextResponse.json({ ...metadata, source: 'pubmed', id: pmid });
      }
    }

    return NextResponse.json({ error: 'Could not fetch metadata' }, { status: 404 });
  } catch (error) {
    console.error('Failed to fetch paper metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}
