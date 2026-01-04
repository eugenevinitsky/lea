import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions, verifiedResearchers } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

// Secret for authenticating requests from the Cloudflare Worker
const API_SECRET = process.env.PAPER_FIREHOSE_SECRET;

// Fetch paper metadata from various sources
async function fetchPaperMetadata(normalizedId: string, source: string): Promise<{ title?: string; authors?: string[] } | null> {
  try {
    if (source === 'arxiv') {
      // Extract arxiv ID (e.g., "2401.12345" from "arxiv:2401.12345")
      const arxivId = normalizedId.replace('arxiv:', '');
      const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
      if (!response.ok) return null;

      const xml = await response.text();
      // Parse title from entry (not the feed title)
      // The entry title comes after <entry> and before </entry>
      const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
      if (!entryMatch) return null;

      const entry = entryMatch[1];
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ');

      // Parse authors from entry
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

    if (source === 'openreview') {
      // OpenReview forum ID (e.g., "openreview:abc123xyz")
      const forumId = normalizedId.replace('openreview:', '');

      try {
        // OpenReview API v2
        const response = await fetch(`https://api2.openreview.net/notes?id=${forumId}`, {
          headers: { 'User-Agent': 'Lea/1.0 (mailto:support@lea.community)' }
        });

        if (!response.ok) {
          // Try API v1 as fallback
          const v1Response = await fetch(`https://api.openreview.net/notes?id=${forumId}`, {
            headers: { 'User-Agent': 'Lea/1.0 (mailto:support@lea.community)' }
          });
          if (!v1Response.ok) return null;

          const v1Data = await v1Response.json();
          const note = v1Data.notes?.[0];
          if (!note) return null;

          const title = note.content?.title;
          const authors = note.content?.authors;
          return { title, authors: Array.isArray(authors) ? authors : undefined };
        }

        const data = await response.json();
        const note = data.notes?.[0];
        if (!note) return null;

        // OpenReview API v2 structure
        const content = note.content || {};
        const title = content.title?.value || content.title;
        const authors = content.authors?.value || content.authors;

        return { title, authors: Array.isArray(authors) ? authors : undefined };
      } catch (error) {
        console.error(`Failed to fetch OpenReview metadata for ${forumId}:`, error);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch metadata for ${normalizedId}:`, error);
    return null;
  }
}

interface PaperData {
  url: string;
  normalizedId: string;
  source: string;
}

interface IngestRequest {
  papers: PaperData[];
  postUri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
  quotedPostUri?: string; // URI of quoted post (for quote posts)
}

// POST /api/papers/ingest - Ingest paper mentions from firehose worker
export async function POST(request: NextRequest) {
  // Verify API secret
  const authHeader = request.headers.get('Authorization');
  if (!API_SECRET || authHeader !== `Bearer ${API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: IngestRequest = await request.json();
    const { papers, postUri, authorDid, postText, createdAt, quotedPostUri } = body;

    // Handle quote posts - if no direct paper links, check if quoted post mentions papers
    if ((!papers || !Array.isArray(papers) || papers.length === 0) && quotedPostUri) {
      // Look up papers mentioned by the quoted post
      const quotedMentions = await db
        .select({
          paperId: paperMentions.paperId,
          normalizedId: discoveredPapers.normalizedId,
        })
        .from(paperMentions)
        .innerJoin(discoveredPapers, eq(paperMentions.paperId, discoveredPapers.id))
        .where(eq(paperMentions.postUri, quotedPostUri));

      if (quotedMentions.length === 0) {
        // Quoted post doesn't mention any papers we track
        return NextResponse.json({ success: true, papers: [], isQuotePost: true });
      }

      // Check if author is a verified researcher
      const [verifiedAuthor] = await db
        .select()
        .from(verifiedResearchers)
        .where(eq(verifiedResearchers.did, authorDid))
        .limit(1);
      const isVerified = !!verifiedAuthor;
      const mentionWeight = isVerified ? 3 : 1;

      const results: { paperId: number; normalizedId: string }[] = [];

      for (const mention of quotedMentions) {
        // Check if mention already exists
        const [existingMention] = await db
          .select()
          .from(paperMentions)
          .where(eq(paperMentions.postUri, postUri))
          .limit(1);

        if (!existingMention) {
          // Update paper mention count
          await db
            .update(discoveredPapers)
            .set({
              lastSeenAt: new Date(),
              mentionCount: sql`${discoveredPapers.mentionCount} + ${mentionWeight}`,
            })
            .where(eq(discoveredPapers.id, mention.paperId));

          // Insert mention
          await db.insert(paperMentions).values({
            paperId: mention.paperId,
            postUri,
            authorDid,
            postText: postText?.slice(0, 1000) || '',
            createdAt: new Date(createdAt),
            isVerifiedResearcher: isVerified,
          });
        }

        results.push({ paperId: mention.paperId, normalizedId: mention.normalizedId });
      }

      return NextResponse.json({ success: true, papers: results, isQuotePost: true });
    }

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return NextResponse.json({ error: 'No papers provided' }, { status: 400 });
    }

    // Check if author is a verified researcher (3x weight for mentions)
    const [verifiedAuthor] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, authorDid))
      .limit(1);
    const isVerified = !!verifiedAuthor;
    const mentionWeight = isVerified ? 3 : 1;

    const results: { paperId: number; normalizedId: string }[] = [];

    for (const paper of papers) {
      // Upsert paper
      const [existingPaper] = await db
        .select()
        .from(discoveredPapers)
        .where(eq(discoveredPapers.normalizedId, paper.normalizedId))
        .limit(1);

      let paperId: number;

      if (existingPaper) {
        // Update existing paper (verified researchers count 3x)
        await db
          .update(discoveredPapers)
          .set({
            lastSeenAt: new Date(),
            mentionCount: sql`${discoveredPapers.mentionCount} + ${mentionWeight}`,
          })
          .where(eq(discoveredPapers.normalizedId, paper.normalizedId));
        paperId = existingPaper.id;
      } else {
        // Fetch metadata for new paper
        const metadata = await fetchPaperMetadata(paper.normalizedId, paper.source);

        // Insert new paper with metadata (verified researchers count 3x)
        const [inserted] = await db
          .insert(discoveredPapers)
          .values({
            url: paper.url,
            normalizedId: paper.normalizedId,
            source: paper.source,
            title: metadata?.title || null,
            authors: metadata?.authors ? JSON.stringify(metadata.authors) : null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            mentionCount: mentionWeight,
          })
          .returning({ id: discoveredPapers.id });
        paperId = inserted.id;
      }

      // Check if mention already exists
      const [existingMention] = await db
        .select()
        .from(paperMentions)
        .where(eq(paperMentions.postUri, postUri))
        .limit(1);

      if (!existingMention) {
        // Insert mention
        await db.insert(paperMentions).values({
          paperId,
          postUri,
          authorDid,
          postText: postText?.slice(0, 1000) || '', // Limit text length
          createdAt: new Date(createdAt),
          isVerifiedResearcher: isVerified,
        });
      }

      results.push({ paperId, normalizedId: paper.normalizedId });
    }

    return NextResponse.json({ success: true, papers: results });
  } catch (error) {
    console.error('Failed to ingest papers:', error);
    return NextResponse.json({ error: 'Failed to ingest papers' }, { status: 500 });
  }
}
