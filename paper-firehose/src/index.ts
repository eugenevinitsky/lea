interface Env {
  JETSTREAM_CONNECTION: DurableObjectNamespace;
  LEA_API_URL: string;
  LEA_API_SECRET: string;
}

// Substack URL patterns
const SUBSTACK_PATTERNS = [
  // Custom subdomain format: eugenewei.substack.com/p/status-as-a-service
  { pattern: /([a-z0-9-]+)\.substack\.com\/p\/([a-z0-9-]+)/i },
  // Newer @ format: substack.com/@username/p/slug
  { pattern: /substack\.com\/@([a-z0-9-]+)\/p\/([a-z0-9-]+)/i },
  // Open/share format: open.substack.com/pub/username/p/slug
  { pattern: /open\.substack\.com\/pub\/([a-z0-9-]+)\/p\/([a-z0-9-]+)/i },
];

interface SubstackMatch {
  url: string;
  normalizedId: string;
  subdomain: string;
  slug: string;
}

// Science/tech journalism article patterns (Quanta, MIT Tech Review, etc.)
const ARTICLE_PATTERNS = [
  // Quanta Magazine: quantamagazine.org/article-slug-12345
  {
    pattern: /quantamagazine\.org\/([a-z0-9-]+)-(\d+)\/?/i,
    source: 'quanta',
    normalize: (slug: string, id: string) => `quanta:${id}`,
    getSlug: (slug: string, id: string) => `${slug}-${id}`,
  },
  // MIT Technology Review: technologyreview.com/2024/01/15/article-slug/
  {
    pattern: /technologyreview\.com\/(\d{4}\/\d{2}\/\d{2})\/([a-z0-9-]+)\/?/i,
    source: 'mittechreview',
    normalize: (date: string, slug: string) => `mittechreview:${slug}`,
    getSlug: (date: string, slug: string) => `${date}/${slug}`,
  },
];

interface ArticleMatch {
  url: string;
  normalizedId: string;
  source: string;
  slug: string;
}

// Paper URL patterns
const PAPER_PATTERNS = [
  // arXiv
  { pattern: /arxiv\.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)/i, source: 'arxiv', normalize: (m: string) => `arxiv:${m}` },
  { pattern: /arxiv\.org\/pdf\/(\d{4}\.\d{4,5}(?:v\d+)?)/i, source: 'arxiv', normalize: (m: string) => `arxiv:${m}` },
  // DOI
  { pattern: /doi\.org\/(10\.\d{4,}\/[^\s]+)/i, source: 'doi', normalize: (m: string) => `doi:${m}` },
  // bioRxiv
  { pattern: /biorxiv\.org\/content\/(10\.\d+\/[^\s\/]+)/i, source: 'biorxiv', normalize: (m: string) => `biorxiv:${m}` },
  // medRxiv
  { pattern: /medrxiv\.org\/content\/(10\.\d+\/[^\s\/]+)/i, source: 'medrxiv', normalize: (m: string) => `medrxiv:${m}` },
  // PubMed
  { pattern: /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i, source: 'pubmed', normalize: (m: string) => `pubmed:${m}` },
  // Nature - various article ID formats: ncomms10986, s41586-024-08234-1, nmeth.1234, etc.
  { pattern: /nature\.com\/articles\/([a-z0-9][a-z0-9._-]+)/i, source: 'nature', normalize: (m: string) => `nature:${m}` },
  // Science
  { pattern: /science\.org\/doi\/(10\.\d+\/[^\s]+)/i, source: 'science', normalize: (m: string) => `doi:${m}` },
  // PNAS
  { pattern: /pnas\.org\/doi\/(10\.\d+\/[^\s]+)/i, source: 'pnas', normalize: (m: string) => `doi:${m}` },
  // Semantic Scholar
  { pattern: /semanticscholar\.org\/paper\/[^\/]+\/([a-f0-9]{40})/i, source: 'semanticscholar', normalize: (m: string) => `s2:${m}` },
  // OpenReview - forum and pdf URLs with id parameter
  { pattern: /openreview\.net\/forum\?id=([a-zA-Z0-9_-]+)/i, source: 'openreview', normalize: (m: string) => `openreview:${m}` },
  { pattern: /openreview\.net\/pdf\?id=([a-zA-Z0-9_-]+)/i, source: 'openreview', normalize: (m: string) => `openreview:${m}` },
];

interface PaperMatch {
  url: string;
  normalizedId: string;
  source: string;
}

// Check if a URL or ID appears to be truncated
function isTruncated(text: string): boolean {
  // Common truncation patterns
  const truncationPatterns = [
    /\.{2,}$/,        // Ends with .. or ...
    /\.{2,}\)?$/,     // Ends with ...) or ...)
    /…$/,             // Ends with ellipsis character
    /\.{2,}\]?$/,     // Ends with ...]
  ];

  return truncationPatterns.some(pattern => pattern.test(text));
}

// Check if text immediately after match position indicates truncation
function isFollowedByTruncation(text: string, matchEnd: number): boolean {
  const after = text.slice(matchEnd, matchEnd + 3);
  return after.startsWith('...') || after.startsWith('…');
}

function extractPaperLinks(text: string): PaperMatch[] {
  const papers: PaperMatch[] = [];
  const seen = new Set<string>();

  // Match paper patterns directly against text (works with or without https://)
  for (const { pattern, source, normalize } of PAPER_PATTERNS) {
    // Use global flag to find all matches
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      if (match[1]) {
        // Skip truncated URLs/IDs - check both the match itself and what follows
        const matchEnd = match.index + match[0].length;
        if (isTruncated(match[0]) || isTruncated(match[1]) || isFollowedByTruncation(text, matchEnd)) {
          console.log(`Skipping truncated paper URL: ${match[0]}`);
          continue;
        }

        const normalizedId = normalize(match[1]);

        // Skip test DOIs (10.1234 is reserved for testing by DOI Foundation)
        if (normalizedId.startsWith('doi:10.1234/')) {
          console.log(`Skipping test DOI: ${normalizedId}`);
          continue;
        }

        if (!seen.has(normalizedId)) {
          seen.add(normalizedId);
          // Reconstruct URL with https:// if missing
          const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
          papers.push({ url, normalizedId, source });
        }
      }
    }
  }

  return papers;
}

function extractSubstackLinks(text: string): SubstackMatch[] {
  const substackPosts: SubstackMatch[] = [];
  const seen = new Set<string>();

  for (const { pattern } of SUBSTACK_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      if (match[1] && match[2]) {
        // Skip truncated URLs
        const matchEnd = match.index + match[0].length;
        if (isTruncated(match[0]) || isFollowedByTruncation(text, matchEnd)) {
          console.log(`Skipping truncated Substack URL: ${match[0]}`);
          continue;
        }

        const subdomain = match[1].toLowerCase();
        const slug = match[2].toLowerCase();
        const normalizedId = `substack:${subdomain}/${slug}`;

        if (!seen.has(normalizedId)) {
          seen.add(normalizedId);
          // Reconstruct URL with https:// if missing
          const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
          substackPosts.push({ url, normalizedId, subdomain, slug });
        }
      }
    }
  }

  return substackPosts;
}

function extractArticleLinks(text: string): ArticleMatch[] {
  const articles: ArticleMatch[] = [];
  const seen = new Set<string>();

  for (const { pattern, source, normalize, getSlug } of ARTICLE_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      if (match[1] && match[2]) {
        // Skip truncated URLs
        const matchEnd = match.index + match[0].length;
        if (isTruncated(match[0]) || isFollowedByTruncation(text, matchEnd)) {
          console.log(`Skipping truncated article URL: ${match[0]}`);
          continue;
        }

        const normalizedId = normalize(match[1], match[2]);
        const slug = getSlug(match[1], match[2]);

        if (!seen.has(normalizedId)) {
          seen.add(normalizedId);
          // Reconstruct URL with https:// if missing
          const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
          articles.push({ url, normalizedId, source, slug });
        }
      }
    }
  }

  return articles;
}

// Jetstream event types
interface JetstreamCommit {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    rev: string;
    operation: string;
    collection: string;
    rkey: string;
    record?: {
      text?: string;
      createdAt?: string;
      embed?: {
        external?: {
          uri?: string;
        };
        // Quote post embed
        record?: {
          uri?: string;
        };
        // Quote post with media (recordWithMedia)
        $type?: string;
      };
    };
    cid: string;
  };
}

// Durable Object for maintaining WebSocket connection
export class JetstreamConnection implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private isConnected = false;
  private processedCount = 0;
  private papersFound = 0;
  private substackFound = 0;
  private articlesFound = 0;
  private lastError: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // Alarm handler - keeps the DO alive and connection open
  async alarm(): Promise<void> {
    // If not connected, reconnect
    if (!this.isConnected && !this.ws) {
      console.log('Alarm: reconnecting...');
      this.connect();
    }
    // Schedule next alarm in 5 seconds to prevent hibernation
    await this.state.storage.setAlarm(Date.now() + 5000);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/start') {
      if (!this.isConnected) {
        this.connect();
        // Schedule alarm to keep DO alive (every 5 seconds)
        await this.state.storage.setAlarm(Date.now() + 5000);
        return new Response(JSON.stringify({ status: 'starting' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Refresh alarm even if already running
      await this.state.storage.setAlarm(Date.now() + 5000);
      return new Response(JSON.stringify({ status: 'already running' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/stop') {
      this.disconnect();
      // Cancel the keep-alive alarm
      await this.state.storage.deleteAlarm();
      return new Response(JSON.stringify({ status: 'stopped' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({
        connected: this.isConnected,
        processedCount: this.processedCount,
        papersFound: this.papersFound,
        substackFound: this.substackFound,
        articlesFound: this.articlesFound,
        lastError: this.lastError,
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }

  private connect() {
    if (this.ws) {
      this.ws.close();
    }

    // Connect to Jetstream - filter for posts only
    const jetstreamUrl = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';

    console.log('Connecting to Jetstream...');
    this.ws = new WebSocket(jetstreamUrl);

    this.ws.addEventListener('open', () => {
      console.log('Connected to Jetstream');
      this.isConnected = true;
      this.lastError = null;
    });

    this.ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string) as JetstreamCommit;
        await this.handleEvent(data);
      } catch (e) {
        console.error('Error processing message:', e);
      }
    });

    this.ws.addEventListener('close', () => {
      console.log('Disconnected from Jetstream');
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', (e) => {
      console.error('WebSocket error:', e);
      this.lastError = 'WebSocket error';
    });
  }

  private disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;

    console.log('Scheduling reconnect in 5 seconds...');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5000) as unknown as number;
  }

  private async handleEvent(event: JetstreamCommit) {
    // Only process create operations on posts
    if (event.kind !== 'commit' ||
        event.commit?.operation !== 'create' ||
        event.commit?.collection !== 'app.bsky.feed.post') {
      return;
    }

    this.processedCount++;

    const record = event.commit.record;
    if (!record) return;

    // Collect text from post and embed
    let fullText = record.text || '';
    if (record.embed?.external?.uri) {
      fullText += ' ' + record.embed.external.uri;
    }

    // Extract paper links, Substack links, and article links
    const papers = extractPaperLinks(fullText);
    const substackPosts = extractSubstackLinks(fullText);
    const articles = extractArticleLinks(fullText);

    // Check for quoted post URI
    const quotedPostUri = record.embed?.record?.uri || null;

    // Skip if no links and no quoted post
    if (papers.length === 0 && substackPosts.length === 0 && articles.length === 0 && !quotedPostUri) return;

    this.papersFound += papers.length;
    this.substackFound += substackPosts.length;
    this.articlesFound += articles.length;

    // Build common request data
    const postUri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    const createdAt = record.createdAt || new Date().toISOString();

    // Send papers to papers API (if any papers or quote post)
    if (papers.length > 0 || quotedPostUri) {
      try {
        const response = await fetch(`${this.env.LEA_API_URL}/api/papers/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.env.LEA_API_SECRET}`,
          },
          body: JSON.stringify({
            papers,
            postUri,
            authorDid: event.did,
            postText: record.text || '',
            createdAt,
            quotedPostUri,
          }),
        });

        const responseText = await response.text();
        if (!response.ok) {
          console.error('Papers API error:', response.status, responseText);
          this.lastError = `Papers API error: ${response.status}`;
        } else {
          const logMsg = papers.length > 0
            ? `Ingested ${papers.length} paper(s) from ${event.did}`
            : `Processed quote post from ${event.did}`;
          console.log(logMsg);
        }
      } catch (e) {
        console.error('Failed to send papers to API:', e);
        this.lastError = `Papers fetch error: ${e}`;
      }
    }

    // Send Substack posts to Substack API (if any Substack links or quote post)
    if (substackPosts.length > 0 || quotedPostUri) {
      try {
        const response = await fetch(`${this.env.LEA_API_URL}/api/substack/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.env.LEA_API_SECRET}`,
          },
          body: JSON.stringify({
            substackPosts,
            postUri,
            authorDid: event.did,
            postText: record.text || '',
            createdAt,
            quotedPostUri,
          }),
        });

        const responseText = await response.text();
        if (!response.ok) {
          console.error('Substack API error:', response.status, responseText);
          this.lastError = `Substack API error: ${response.status}`;
        } else {
          const logMsg = substackPosts.length > 0
            ? `Ingested ${substackPosts.length} Substack post(s) from ${event.did}`
            : `Processed quote post (Substack) from ${event.did}`;
          console.log(logMsg);
        }
      } catch (e) {
        console.error('Failed to send Substack to API:', e);
        this.lastError = `Substack fetch error: ${e}`;
      }
    }

    // Send articles to articles API (if any article links)
    if (articles.length > 0) {
      try {
        const response = await fetch(`${this.env.LEA_API_URL}/api/articles/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.env.LEA_API_SECRET}`,
          },
          body: JSON.stringify({
            articles,
            postUri,
            authorDid: event.did,
            postText: record.text || '',
            createdAt,
          }),
        });

        const responseText = await response.text();
        if (!response.ok) {
          console.error('Articles API error:', response.status, responseText);
          this.lastError = `Articles API error: ${response.status}`;
        } else {
          console.log(`Ingested ${articles.length} article(s) from ${event.did}`);
        }
      } catch (e) {
        console.error('Failed to send articles to API:', e);
        this.lastError = `Articles fetch error: ${e}`;
      }
    }

    this.lastError = null;
  }
}

// Main worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Get the Durable Object instance
    const id = env.JETSTREAM_CONNECTION.idFromName('main');
    const stub = env.JETSTREAM_CONNECTION.get(id);

    // Route to Durable Object
    if (url.pathname === '/start' || url.pathname === '/stop' || url.pathname === '/status') {
      return stub.fetch(request);
    }

    return new Response('Paper Firehose Worker\n\nEndpoints:\n- /start - Start consuming firehose\n- /stop - Stop consuming\n- /status - Get status\n\nPapers are sent to the Lea API for storage.', {
      headers: { 'Content-Type': 'text/plain' }
    });
  },

  // Cron trigger to keep the connection alive
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const id = env.JETSTREAM_CONNECTION.idFromName('main');
    const stub = env.JETSTREAM_CONNECTION.get(id);

    // Ping /start to ensure connection is active
    await stub.fetch(new Request('https://internal/start'));
    console.log('Cron: pinged firehose connection');
  },
};
