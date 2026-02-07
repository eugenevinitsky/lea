import { NextRequest, NextResponse } from 'next/server';
import { initEmbeddingClassifier, classifyContentAsync, isEmbeddingClassifierReady, TECHNICAL_THRESHOLD } from '@/lib/substack-classifier';
import { timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const API_SECRET = process.env.PAPER_FIREHOSE_SECRET;

function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Diagnostic endpoint to check classifier status
export async function POST(request: NextRequest) {
  // Verify API secret
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${API_SECRET}`;
  if (!API_SECRET || !authHeader || !secureCompare(authHeader, expectedAuth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if already initialized
    const wasReady = isEmbeddingClassifierReady();

    // Try to initialize
    const initResult = await initEmbeddingClassifier();

    // Check if now ready
    const isReady = isEmbeddingClassifierReady();

    // Test classification on the actual problematic posts
    const testCases = [
      {
        title: "Spoiler alert: The giant loses",
        description: "Cartoon by Shields",
        body: "Leave a comment Thanks for reading! Subscribe for free to receive new posts and support my work. Share Fight the Fire This post is public so feel free to share it."
      },
      {
        title: "Americans May Not Like Them, But They're Still Voting For Them",
        description: "The Democratic Party hits new lows on the favorability front",
        body: "Welcome to the Polling USA House model for February 1, 2026! Every week brings something new in American politics, and this week it's the reemergence of many thousands of documents related to the JFK assassination."
      },
    ];

    const testResults = [];
    if (isReady) {
      for (const tc of testCases) {
        const result = await classifyContentAsync(tc.title, tc.description, tc.body, 15);
        testResults.push({
          title: tc.title.slice(0, 40),
          isTechnical: result.isTechnical,
          probability: result.probability,
          titleDescProb: result.titleDescProb,
          bodyProb: result.bodyProb,
          wouldBeInserted: result.isTechnical,
        });
      }
    }

    return NextResponse.json({
      wasReadyBefore: wasReady,
      initResult,
      isReadyNow: isReady,
      threshold: TECHNICAL_THRESHOLD,
      testResults,
      env: {
        hasGoogleApiKey: !!process.env.GOOGLE_AI_API_KEY,
        nodeEnv: process.env.NODE_ENV,
      },
      // Only include path debugging in development
      ...(process.env.NODE_ENV === 'development' && {
        paths: {
          __dirname: __dirname,
          cwd: process.cwd(),
          embeddingsInDirname: fs.existsSync(path.join(__dirname, 'classifier-embeddings.json')),
          embeddingsInLib: fs.existsSync(path.join(process.cwd(), 'lib', 'classifier-embeddings.json')),
          dirnameContents: fs.existsSync(__dirname) ? fs.readdirSync(__dirname).slice(0, 10) : [],
        }
      })
    });
  } catch (error) {
    console.error('Classifier status error:', error);
    return NextResponse.json({
      error: 'An error occurred while checking classifier status',
    }, { status: 500 });
  }
}
