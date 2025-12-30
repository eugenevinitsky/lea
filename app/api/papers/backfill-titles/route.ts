import { NextResponse } from 'next/server';
import { db, discoveredPapers } from '@/lib/db';
import { isNull, eq } from 'drizzle-orm';

// Fetch paper metadata from various sources
async function fetchPaperMetadata(normalizedId: string, source: string): Promise<{ title?: string; authors?: string[] } | null> {
  try {
    if (source === 'arxiv') {
      const arxivId = normalizedId.replace('arxiv:', '');
      const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
      if (!response.ok) return null;

      const xml = await response.text();
      // Parse title from entry (not the feed title)
      const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
      if (!entryMatch) return null;

      const entry = entryMatch[1];
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ');

      const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
      const authors = Array.from(authorMatches).map(m => m[1].trim());

      return { title, authors: authors.length > 0 ? authors : undefined };
    }

    if (source === 'doi' || source === 'biorxiv' || source === 'medrxiv' || source === 'science' || source === 'pnas') {
      // Extract DOI from normalized ID
      let doi = normalizedId;
      if (source === 'biorxiv' || source === 'medrxiv') {
        doi = normalizedId.replace(`${source}:`, '');
        // Strip version suffix (v1, v2, etc.) for preprints
        doi = doi.replace(/v\d+$/, '');
      } else if (source === 'doi') {
        doi = normalizedId.replace('doi:', '');
      }

      // Use DOI content negotiation (works for all DOI sources including preprints)
      const response = await fetch(`https://doi.org/${doi}`, {
        headers: {
          'Accept': 'application/vnd.citationstyles.csl+json',
          'User-Agent': 'Lea/1.0 (mailto:support@lea.community)'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        // Fallback to CrossRef API
        const crossrefResponse = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
          headers: { 'User-Agent': 'Lea/1.0 (mailto:support@lea.community)' }
        });
        if (!crossrefResponse.ok) return null;

        const data = await crossrefResponse.json();
        const work = data.message;
        const title = work?.title?.[0];
        const authors = work?.author?.map((a: { given?: string; family?: string }) =>
          `${a.given || ''} ${a.family || ''}`.trim()
        ).filter(Boolean);
        return { title, authors };
      }

      const data = await response.json();
      const title = data?.title;
      const authors = data?.author?.map((a: { given?: string; family?: string }) =>
        `${a.given || ''} ${a.family || ''}`.trim()
      ).filter(Boolean);

      return { title, authors };
    }

    if (source === 'pubmed') {
      const pmid = normalizedId.replace('pubmed:', '');
      const response = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`
      );
      if (!response.ok) return null;

      const data = await response.json();
      const result = data.result?.[pmid];
      const title = result?.title;
      const authors = result?.authors?.map((a: { name: string }) => a.name);

      return { title, authors };
    }

    if (source === 'nature') {
      // Nature article IDs map to DOIs as 10.1038/{article-id}
      const articleId = normalizedId.replace('nature:', '');
      const doi = `10.1038/${articleId}`;

      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        headers: { 'User-Agent': 'Lea/1.0 (mailto:support@lea.community)' }
      });
      if (!response.ok) return null;

      const data = await response.json();
      const work = data.message;
      const title = work?.title?.[0];
      const authors = work?.author?.map((a: { given?: string; family?: string }) =>
        `${a.given || ''} ${a.family || ''}`.trim()
      ).filter(Boolean);

      return { title, authors };
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch metadata for ${normalizedId}:`, error);
    return null;
  }
}

// POST /api/papers/backfill-titles - Backfill titles for papers without them
export async function POST() {
  try {
    // Get papers without titles OR with bad titles (like "arXiv Query:")
    const papersWithoutTitles = await db
      .select()
      .from(discoveredPapers)
      .limit(50);

    // Filter to papers needing title update
    const papersToUpdate = papersWithoutTitles.filter(p =>
      !p.title || p.title.startsWith('arXiv Query:')
    );

    const results: { id: number; normalizedId: string; title?: string }[] = [];

    for (const paper of papersToUpdate) {
      const metadata = await fetchPaperMetadata(paper.normalizedId, paper.source);

      if (metadata?.title) {
        await db
          .update(discoveredPapers)
          .set({
            title: metadata.title,
            authors: metadata.authors ? JSON.stringify(metadata.authors) : null,
          })
          .where(eq(discoveredPapers.id, paper.id));

        results.push({ id: paper.id, normalizedId: paper.normalizedId, title: metadata.title });
      } else {
        results.push({ id: paper.id, normalizedId: paper.normalizedId });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Failed to backfill titles:', error);
    return NextResponse.json({ error: 'Failed to backfill titles' }, { status: 500 });
  }
}
