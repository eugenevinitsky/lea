# LEA Codebase Guide

---

## Security Guidelines (DO NOT VIOLATE)

### Critical: Never Commit Secrets
- `.env.local` contains production secrets - NEVER commit this file
- If secrets are ever exposed, rotate ALL of them immediately
- Use Vercel environment variables for production, not local files

### High Priority Security Patterns

**1. Always Rate Limit Auth Endpoints**
- Any endpoint that handles authentication, invite codes, or session creation MUST have rate limiting
- Use Upstash Redis or similar: `Ratelimit.slidingWindow(5, "1 m")`
- Current gap: `/api/auth/redeem-invite`, `/api/vouching/request` lack rate limiting

**2. Sanitize dangerouslySetInnerHTML**
- ALWAYS use DOMPurify when rendering user-controlled HTML
- Current risk: `components/Post.tsx` uses dangerouslySetInnerHTML for KaTeX/Prism output
- Fix: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}`

**3. No Hardcoded Fallback URLs**
- Never provide hardcoded fallback URLs for external services
- Current issue: Ozone URL has hardcoded AWS fallback in `api/labeler/sync-from-ozone/route.ts`
- Fix: Fail explicitly if required env vars are missing

**4. Generic Error Messages to Clients**
- Log full errors server-side, return generic messages to clients
- Bad: `return NextResponse.json({ error: String(error) }, { status: 500 })`
- Good: `console.error('Error:', error); return NextResponse.json({ error: 'An error occurred' }, { status: 500 })`

**5. Keep Dependencies Updated**
- Next.js and other deps have known CVEs - update regularly
- Run `npm audit` periodically
- Current: Next.js 16.1.1 has CVEs, update to 16.1.5+

### Good Practices Already in Place
- Timing-safe secret comparison (`crypto.timingSafeEqual`)
- SSRF protection in link-meta and oauth-proxy routes
- Parameterized queries via Drizzle ORM (no SQL injection)
- HttpOnly, SameSite, Secure flags on session cookies
- Authorization checks (DID matching for user data)

---

## Substack Classifier: Cleanup & Retraining Procedure

This documents how to clean up non-technical Substack posts from the database and retrain the classifier to reduce false positives.

### Overview

The system uses an embedding-based k-NN classifier powered by Google's `gemini-embedding-001` model to filter technical vs non-technical content. Posts with probability < 0.65 are considered non-technical.

**Key files:**
- `lib/substack-classifier.ts` - Main classifier code
- `lib/classifier-embeddings.json` - Pre-computed training embeddings (~100MB)
- `data/training-data.json` - Training examples with labels
- `scripts/cleanup-substack-local.ts` - Cleanup script
- `scripts/train-embedding-classifier.ts` - Training script
- `scripts/add-bulk-training-examples.ts` - Add new training examples

### Prerequisites

1. `GOOGLE_AI_API_KEY` in `.env.local` (free key from https://aistudio.google.com/app/apikey)
2. Database connection configured

### Step 1: Run Cleanup (Dry Run)

See what posts would be removed without deleting anything:

```bash
npx tsx scripts/cleanup-substack-local.ts --dry-run
```

This will:
- Classify all Substack posts using the current model
- Save results to `data/cleanup-results.json`
- Display posts that would be removed (probability < 0.65)

Optional flags:
- `--limit N` - Process only first N posts (for testing)

### Step 2: Review Results

Open `data/cleanup-results.json` and review:
- `kept` array: Posts classified as technical (should stay)
- `removed` array: Posts classified as non-technical (will be deleted)

Look for:
- **False positives**: Posts in "kept" that should be removed (non-technical content incorrectly classified as technical)
- **False negatives**: Posts in "removed" that should stay (technical content incorrectly rejected)

### Step 3: Add Training Examples

Edit `scripts/add-bulk-training-examples.ts`:

```typescript
// Add false positives to this array (non-technical content being misclassified as technical)
const nonTechExamples: string[] = [
  "Your example title or description here...",
  // Add more...
];

// Add false negatives to this array (technical content being incorrectly rejected)
const techExamples: string[] = [
  "Your technical example here...",
  // Add more...
];
```

Then run:

```bash
npx tsx scripts/add-bulk-training-examples.ts
```

This appends examples to `data/training-data.json`.

### Step 4: Retrain the Classifier

```bash
npx tsx scripts/train-embedding-classifier.ts
```

**Note:** This takes 20-30 minutes due to API rate limits (free tier: 100 requests/minute).

The script:
- Loads `data/training-data.json`
- Generates embeddings for all examples using Google's API
- Computes class centroids
- Saves to `lib/classifier-embeddings.json`

### Step 5: Verify the Fix

Run cleanup dry-run again to check if false positives are now correctly classified:

```bash
npx tsx scripts/cleanup-substack-local.ts --dry-run
```

Compare with previous results.

### Step 6: Execute Cleanup

Once satisfied, run without `--dry-run` to actually delete non-technical posts:

```bash
npx tsx scripts/cleanup-substack-local.ts
```

This deletes:
1. Mentions (foreign key constraint)
2. Posts themselves

### Troubleshooting

**API Rate Limits:**
If you see "429 Too Many Requests", the script has built-in retry logic with exponential backoff. Just wait.

**Model Not Found:**
If you see "models/text-embedding-004 is not found", the model name needs updating. Current model: `gemini-embedding-001`

**Classifier Not Initialized:**
Check that `GOOGLE_AI_API_KEY` is set in `.env.local`

### Classification Threshold

The threshold is `0.65` (defined in `lib/substack-classifier.ts` as `TECHNICAL_THRESHOLD`).

- Probability >= 0.65 = technical (kept)
- Probability < 0.65 = non-technical (removed)

Both title+description AND body text are classified; the minimum probability is used (conservative approach).

### Training Data Format

`data/training-data.json`:
```json
[
  { "text": "Article title and description...", "label": "technical" },
  { "text": "Non-tech article...", "label": "non-technical" }
]
```

Current distribution: ~25% technical, ~75% non-technical (~8500 examples).

### Quick Reference

| Task | Command |
|------|---------|
| Dry run cleanup | `npx tsx scripts/cleanup-substack-local.ts --dry-run` |
| Add training examples | Edit then run `npx tsx scripts/add-bulk-training-examples.ts` |
| Retrain classifier | `npx tsx scripts/train-embedding-classifier.ts` |
| Execute cleanup | `npx tsx scripts/cleanup-substack-local.ts` |

---

## Debugging: Non-Technical Posts Getting Through (Feb 2, 2026) - RESOLVED

### Problem
Non-technical posts were being inserted into the database despite the classifier being configured to reject them.

### Root Cause: Staging Worker Running
**Hypothesis 2 was correct.** A staging Cloudflare worker (`paper-firehose-staging`) was running alongside the production worker, both processing the same Bluesky firehose. The staging worker was inserting posts without proper classifier filtering.

### Evidence
- 154 posts inserted on Feb 2 vs ~10/day normally (15x increase)
- Staging worker showed `substackFound: 3052` when checked
- After deleting staging worker: only 1 post in 15+ minutes (182 found → 1 accepted = 99.4% rejection rate)

### Fix Applied (Feb 2, 2026)
1. Stopped the staging worker: `curl -X POST "https://paper-firehose-staging.vinitsky-eugene.workers.dev/stop"`
2. Deleted the staging worker: `wrangler delete paper-firehose-staging --name paper-firehose-staging`
3. Verified production worker is running with correct secrets

### Architecture
```
Bluesky Firehose → Cloudflare Worker (paper-firehose) → Vercel API (/api/substack/ingest)
                   extracts URLs                        runs classifier
```

### Cleanup Steps
The existing non-technical posts in the database need to be cleaned up:
```bash
# Preview what will be deleted
npx tsx scripts/cleanup-substack-local.ts --dry-run

# Execute cleanup (deletes non-technical posts)
npx tsx scripts/cleanup-substack-local.ts
```

### Diagnostic Commands (for future debugging)

```bash
# Check recent posts and their classifier scores
npx tsx scripts/cleanup-substack-local.ts --dry-run --limit 50

# Check Cloudflare worker status
curl -s "https://paper-firehose.vinitsky-eugene.workers.dev/status"

# Tail worker logs
cd paper-firehose && wrangler tail paper-firehose --format=pretty

# Check if any rogue workers exist
wrangler deployments list

# Test production classifier directly
curl -X POST "https://client-kappa-weld-68.vercel.app/api/classifier-status/" \
  -H "Authorization: Bearer $PAPER_FIREHOSE_SECRET"
```

### Prevention
- Don't deploy staging workers to production without proper cleanup
- If a staging worker exists, ensure it's pointing to a staging API or is stopped
- Regularly check for rogue workers: `wrangler deployments list`
