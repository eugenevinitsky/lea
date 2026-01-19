import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions, verifiedResearchers } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { initEmbeddingClassifier, classifyContentAsync, isEmbeddingClassifierReady } from '@/lib/substack-classifier';
import { isBot } from '@/lib/bot-blacklist';
import { timingSafeEqual } from 'crypto';

// Secret for authenticating requests from the Cloudflare Worker
const API_SECRET = process.env.PAPER_FIREHOSE_SECRET;

// Timing-safe comparison to prevent timing attacks on secret verification
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Initialize embedding classifier on first request
let classifierInitialized = false;
async function ensureClassifierInitialized() {
  if (!classifierInitialized && !isEmbeddingClassifierReady()) {
    classifierInitialized = await initEmbeddingClassifier();
  }
}

// Strip HTML tags and decode entities to get plain text
function stripHtml(html: string): string {
  return html
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '-')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Try to fetch article body from RSS feed
async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
  try {
    // Construct RSS feed URL - handle custom domains
    const feedUrl = `https://${subdomain}.substack.com/feed`;

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) return null;

    const xml = await response.text();

    // Find the item with matching slug in link
    const items = xml.split('<item>');
    for (const item of items.slice(1)) { // Skip first split (before first <item>)
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
        // Found matching item - extract content:encoded
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          const bodyText = stripHtml(contentMatch[1]);
          // Return first 2000 chars of body text for classification
          return bodyText.slice(0, 2000);
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch RSS for ${subdomain}:`, error);
    return null;
  }
}

// Fetch metadata from Substack post via Open Graph tags and RSS feed
async function fetchSubstackMetadata(url: string, subdomain?: string, slug?: string): Promise<{
  title?: string;
  description?: string;
  author?: string;
  newsletterName?: string;
  imageUrl?: string;
  bodyText?: string;
} | null> {
  try {
    // Try to fetch body text from RSS feed (more text for better classification)
    let bodyText: string | null = null;
    if (subdomain && slug) {
      bodyText = await fetchBodyFromRss(subdomain, slug);
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract Open Graph metadata
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1] ||
                    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)?.[1];
    const ogDescription = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1] ||
                          html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i)?.[1];
    const ogSiteName = html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i)?.[1] ||
                       html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:site_name"/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] ||
                    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1];

    // Try to extract author from meta tags or JSON-LD
    let author: string | undefined;
    const authorMeta = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i)?.[1] ||
                       html.match(/<meta[^>]*content="([^"]+)"[^>]*name="author"/i)?.[1];
    if (authorMeta) {
      author = authorMeta;
    } else {
      // Try JSON-LD
      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.author?.name) {
            author = jsonLd.author.name;
          } else if (Array.isArray(jsonLd.author) && jsonLd.author[0]?.name) {
            author = jsonLd.author[0].name;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    // Decode HTML entities in extracted strings
    const decodeHtml = (str: string | undefined) => {
      if (!str) return str;
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    };

    return {
      title: decodeHtml(ogTitle),
      description: decodeHtml(ogDescription),
      newsletterName: decodeHtml(ogSiteName),
      author: decodeHtml(author),
      imageUrl: ogImage,
      bodyText: bodyText || undefined,
    };
  } catch (error) {
    console.error(`Failed to fetch Substack metadata for ${url}:`, error);
    return null;
  }
}

interface SubstackData {
  url: string;
  normalizedId: string;
  subdomain: string;
  slug: string;
}

interface IngestRequest {
  substackPosts: SubstackData[];
  postUri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
  quotedPostUri?: string | null; // URI of quoted post (for quote posts)
}

interface BatchedIngestRequest {
  batch: IngestRequest[];
}

// Process a single ingest request
async function processSingleIngest(req: IngestRequest): Promise<{ substackPostId: number; normalizedId: string }[]> {
  const { substackPosts, postUri, authorDid, postText, createdAt, quotedPostUri } = req;

  // Skip mentions from known bots
  if (isBot(authorDid)) {
    return [];
  }

  // Handle quote posts - if no direct Substack links, check if quoted post mentions Substack
  if ((!substackPosts || !Array.isArray(substackPosts) || substackPosts.length === 0) && quotedPostUri) {
    // Look up Substack posts mentioned by the quoted post
    const quotedMentions = await db
      .select({
        substackPostId: substackMentions.substackPostId,
        normalizedId: discoveredSubstackPosts.normalizedId,
      })
      .from(substackMentions)
      .innerJoin(discoveredSubstackPosts, eq(substackMentions.substackPostId, discoveredSubstackPosts.id))
      .where(eq(substackMentions.postUri, quotedPostUri));

    if (quotedMentions.length === 0) {
      return [];
    }

    // Check if author is a verified researcher
    const [verifiedAuthor] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, authorDid))
      .limit(1);
    const isVerified = !!verifiedAuthor;
    const mentionWeight = isVerified ? 3 : 1;

    const results: { substackPostId: number; normalizedId: string }[] = [];

    for (const mention of quotedMentions) {
      // Check if mention already exists
      const [existingMention] = await db
        .select()
        .from(substackMentions)
        .where(eq(substackMentions.postUri, postUri))
        .limit(1);

      if (!existingMention) {
        // Update Substack post mention count
        await db
          .update(discoveredSubstackPosts)
          .set({
            lastSeenAt: new Date(),
            mentionCount: sql`${discoveredSubstackPosts.mentionCount} + ${mentionWeight}`,
          })
          .where(eq(discoveredSubstackPosts.id, mention.substackPostId));

        // Insert mention
        await db.insert(substackMentions).values({
          substackPostId: mention.substackPostId,
          postUri,
          authorDid,
          postText: postText?.slice(0, 1000) || '',
          createdAt: new Date(createdAt),
          isVerifiedResearcher: isVerified,
        });
      }

      results.push({ substackPostId: mention.substackPostId, normalizedId: mention.normalizedId });
    }

    return results;
  }

  if (!substackPosts || !Array.isArray(substackPosts) || substackPosts.length === 0) {
    return [];
  }

  // Check if author is a verified researcher (3x weight for mentions)
  const [verifiedAuthor] = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.did, authorDid))
    .limit(1);
  const isVerified = !!verifiedAuthor;
  const mentionWeight = isVerified ? 3 : 1;

  const results: { substackPostId: number; normalizedId: string }[] = [];

  for (const post of substackPosts) {
    // Upsert Substack post
    const [existingPost] = await db
      .select()
      .from(discoveredSubstackPosts)
      .where(eq(discoveredSubstackPosts.normalizedId, post.normalizedId))
      .limit(1);

    let substackPostId: number;

    if (existingPost) {
      // Update existing post
      await db
        .update(discoveredSubstackPosts)
        .set({
          lastSeenAt: new Date(),
          mentionCount: sql`${discoveredSubstackPosts.mentionCount} + ${mentionWeight}`,
        })
        .where(eq(discoveredSubstackPosts.normalizedId, post.normalizedId));
      substackPostId = existingPost.id;
    } else {
      // Fetch metadata for new post
      const metadata = await fetchSubstackMetadata(post.url, post.subdomain, post.slug);

      // Skip paywalled content (no body text available)
      if (!metadata?.bodyText || metadata.bodyText.length < 100) {
        console.log(`Skipping paywalled Substack post: ${post.url} (title: ${metadata?.title})`);
        continue;
      }

      // Filter for technical/intellectual content using embedding classifier
      // Use body text for classification (more accurate than title+description)
      const result = await classifyContentAsync(
        metadata?.title || '',
        metadata?.description || '',
        metadata?.bodyText
      );

      if (!result.isTechnical) {
        console.log(`Skipping non-technical Substack post: ${post.url} (title: ${metadata?.title}, prob: ${result.probability.toFixed(3)})`);
        continue;
      }

      // Insert new Substack post with metadata
      const [inserted] = await db
        .insert(discoveredSubstackPosts)
        .values({
          url: post.url,
          normalizedId: post.normalizedId,
          subdomain: post.subdomain,
          slug: post.slug,
          title: metadata?.title || null,
          description: metadata?.description || null,
          author: metadata?.author || null,
          newsletterName: metadata?.newsletterName || null,
          imageUrl: metadata?.imageUrl || null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          mentionCount: mentionWeight,
        })
        .returning({ id: discoveredSubstackPosts.id });
      substackPostId = inserted.id;
    }

    // Check if mention already exists
    const [existingMention] = await db
      .select()
      .from(substackMentions)
      .where(eq(substackMentions.postUri, postUri))
      .limit(1);

    if (!existingMention) {
      // Insert mention
      await db.insert(substackMentions).values({
        substackPostId,
        postUri,
        authorDid,
        postText: postText?.slice(0, 1000) || '',
        createdAt: new Date(createdAt),
        isVerifiedResearcher: isVerified,
      });
    }

    results.push({ substackPostId, normalizedId: post.normalizedId });
  }

  return results;
}

// POST /api/substack/ingest - Ingest Substack mentions from firehose worker
export async function POST(request: NextRequest) {
  // Verify API secret (timing-safe to prevent timing attacks)
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${API_SECRET}`;
  if (!API_SECRET || !authHeader || !secureCompare(authHeader, expectedAuth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Initialize embedding classifier if needed
    await ensureClassifierInitialized();

    const body = await request.json();

    // Check if this is a batched request
    if (body.batch && Array.isArray(body.batch)) {
      const batchedBody = body as BatchedIngestRequest;
      const allResults: { substackPostId: number; normalizedId: string }[] = [];

      for (const req of batchedBody.batch) {
        const results = await processSingleIngest(req);
        allResults.push(...results);
      }

      console.log(`Processed batch of ${batchedBody.batch.length} requests, ${allResults.length} substack posts`);
      return NextResponse.json({ success: true, substackPosts: allResults, batchSize: batchedBody.batch.length });
    }

    // Handle single request (backwards compatibility)
    const singleBody = body as IngestRequest;
    const { substackPosts, postUri, authorDid, postText, createdAt, quotedPostUri } = singleBody;

    // Handle quote posts - if no direct Substack links, check if quoted post mentions Substack
    if ((!substackPosts || !Array.isArray(substackPosts) || substackPosts.length === 0) && quotedPostUri) {
      // Look up Substack posts mentioned by the quoted post
      const quotedMentions = await db
        .select({
          substackPostId: substackMentions.substackPostId,
          normalizedId: discoveredSubstackPosts.normalizedId,
        })
        .from(substackMentions)
        .innerJoin(discoveredSubstackPosts, eq(substackMentions.substackPostId, discoveredSubstackPosts.id))
        .where(eq(substackMentions.postUri, quotedPostUri));

      if (quotedMentions.length === 0) {
        // Quoted post doesn't mention any Substack posts we track
        return NextResponse.json({ success: true, substackPosts: [], isQuotePost: true });
      }

      // Check if author is a verified researcher
      const [verifiedAuthor] = await db
        .select()
        .from(verifiedResearchers)
        .where(eq(verifiedResearchers.did, authorDid))
        .limit(1);
      const isVerified = !!verifiedAuthor;
      const mentionWeight = isVerified ? 3 : 1;

      const results: { substackPostId: number; normalizedId: string }[] = [];

      for (const mention of quotedMentions) {
        // Check if mention already exists
        const [existingMention] = await db
          .select()
          .from(substackMentions)
          .where(eq(substackMentions.postUri, postUri))
          .limit(1);

        if (!existingMention) {
          // Update Substack post mention count
          await db
            .update(discoveredSubstackPosts)
            .set({
              lastSeenAt: new Date(),
              mentionCount: sql`${discoveredSubstackPosts.mentionCount} + ${mentionWeight}`,
            })
            .where(eq(discoveredSubstackPosts.id, mention.substackPostId));

          // Insert mention
          await db.insert(substackMentions).values({
            substackPostId: mention.substackPostId,
            postUri,
            authorDid,
            postText: postText?.slice(0, 1000) || '',
            createdAt: new Date(createdAt),
            isVerifiedResearcher: isVerified,
          });
        }

        results.push({ substackPostId: mention.substackPostId, normalizedId: mention.normalizedId });
      }

      return NextResponse.json({ success: true, substackPosts: results, isQuotePost: true });
    }

    if (!substackPosts || !Array.isArray(substackPosts) || substackPosts.length === 0) {
      return NextResponse.json({ error: 'No Substack posts provided' }, { status: 400 });
    }

    // Check if author is a verified researcher (3x weight for mentions)
    const [verifiedAuthor] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, authorDid))
      .limit(1);
    const isVerified = !!verifiedAuthor;
    const mentionWeight = isVerified ? 3 : 1;

    const results: { substackPostId: number; normalizedId: string }[] = [];

    for (const post of substackPosts) {
      // Upsert Substack post
      const [existingPost] = await db
        .select()
        .from(discoveredSubstackPosts)
        .where(eq(discoveredSubstackPosts.normalizedId, post.normalizedId))
        .limit(1);

      let substackPostId: number;

      if (existingPost) {
        // Update existing post
        await db
          .update(discoveredSubstackPosts)
          .set({
            lastSeenAt: new Date(),
            mentionCount: sql`${discoveredSubstackPosts.mentionCount} + ${mentionWeight}`,
          })
          .where(eq(discoveredSubstackPosts.normalizedId, post.normalizedId));
        substackPostId = existingPost.id;
      } else {
        // Fetch metadata for new post (including body text from RSS for better classification)
        const metadata = await fetchSubstackMetadata(post.url, post.subdomain, post.slug);

        // Skip paywalled content (no body text available)
        if (!metadata?.bodyText || metadata.bodyText.length < 100) {
          console.log(`Skipping paywalled Substack post: ${post.url} (title: ${metadata?.title})`);
          continue;
        }

        // Filter for technical/intellectual content using embedding classifier
        // Use body text for classification (more accurate than title+description)
        const result = await classifyContentAsync(
          metadata?.title || '',
          metadata?.description || '',
          metadata?.bodyText
        );

        if (!result.isTechnical) {
          console.log(`Skipping non-technical Substack post: ${post.url} (title: ${metadata?.title}, prob: ${result.probability.toFixed(3)})`);
          continue;
        }

        // Insert new Substack post with metadata
        const [inserted] = await db
          .insert(discoveredSubstackPosts)
          .values({
            url: post.url,
            normalizedId: post.normalizedId,
            subdomain: post.subdomain,
            slug: post.slug,
            title: metadata?.title || null,
            description: metadata?.description || null,
            author: metadata?.author || null,
            newsletterName: metadata?.newsletterName || null,
            imageUrl: metadata?.imageUrl || null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            mentionCount: mentionWeight,
          })
          .returning({ id: discoveredSubstackPosts.id });
        substackPostId = inserted.id;
      }

      // Check if mention already exists
      const [existingMention] = await db
        .select()
        .from(substackMentions)
        .where(eq(substackMentions.postUri, postUri))
        .limit(1);

      if (!existingMention) {
        // Insert mention
        await db.insert(substackMentions).values({
          substackPostId,
          postUri,
          authorDid,
          postText: postText?.slice(0, 1000) || '',
          createdAt: new Date(createdAt),
          isVerifiedResearcher: isVerified,
        });
      }

      results.push({ substackPostId, normalizedId: post.normalizedId });
    }

    return NextResponse.json({ success: true, substackPosts: results });
  } catch (error) {
    console.error('Failed to ingest Substack posts:', error);
    return NextResponse.json({ error: 'Failed to ingest Substack posts' }, { status: 500 });
  }
}
