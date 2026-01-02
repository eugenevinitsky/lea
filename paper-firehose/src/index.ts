interface Env {
  JETSTREAM_CONNECTION: DurableObjectNamespace;
  LEA_API_URL: string;
  LEA_API_SECRET: string;
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
  // Nature - article IDs like s41586-024-08234-1 (letter + 5 digits + dashes + more)
  { pattern: /nature\.com\/articles\/([sd]\d{5}-\d{2,4}-\d{4,}-\d)/i, source: 'nature', normalize: (m: string) => `nature:${m}` },
  // Science
  { pattern: /science\.org\/doi\/(10\.\d+\/[^\s]+)/i, source: 'science', normalize: (m: string) => `doi:${m}` },
  // PNAS
  { pattern: /pnas\.org\/doi\/(10\.\d+\/[^\s]+)/i, source: 'pnas', normalize: (m: string) => `doi:${m}` },
  // Semantic Scholar
  { pattern: /semanticscholar\.org\/paper\/[^\/]+\/([a-f0-9]{40})/i, source: 'semanticscholar', normalize: (m: string) => `s2:${m}` },
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
        // Skip truncated URLs/IDs
        if (isTruncated(match[0]) || isTruncated(match[1])) {
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

    // Extract paper links
    const papers = extractPaperLinks(fullText);
    if (papers.length === 0) return;

    this.papersFound += papers.length;

    // Send to API
    const postUri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    const createdAt = record.createdAt || new Date().toISOString();

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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        this.lastError = `API error: ${response.status}`;
      } else {
        console.log(`Ingested ${papers.length} paper(s) from ${event.did}`);
        this.lastError = null;
      }
    } catch (e) {
      console.error('Failed to send to API:', e);
      this.lastError = `Fetch error: ${e}`;
    }
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
