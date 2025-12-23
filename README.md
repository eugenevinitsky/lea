# Lea

A Bluesky client with protective defaults for researchers.

## TL;DR

| Feature | Description |
|---------|-------------|
| **ORCID Verification** | Link ORCID to verify researcher identity |
| **Reply Restrictions** | Auto-restrict replies to followers, verified researchers, or your personal 1-hop community |
| **Papers Feed** | Timeline filtered to academic paper links only |
| **Full Client** | Post, reply, like, repost, quote, view threads |

**Live:** https://client-kappa-weld-68.vercel.app

---

## Features

### Researcher Verification

Verify your researcher identity by linking your ORCID account at `/verify`.

**Auto-approval criteria:**
- 3+ publications at established academic venues
- At least 1 publication in the last 5 years
- Valid ORCID linked to OpenAlex

Verified researchers:
- Get added to the "Verified Researchers" Bluesky list
- Get a personal community list created with their 1-hop connections
- Can restrict replies to only verified researchers or their personal community

### Protective Threadgates

When posting, auto-apply reply restrictions:

| Option | Who Can Reply |
|--------|--------------|
| People you follow | Only accounts you follow |
| Verified researchers only | Only ORCID-verified researchers |
| My community | Verified researchers + YOUR direct followers/following (1-hop from you) |
| Anyone | No restrictions |

**Key difference:** "My community" is personal to YOU - it's people who follow you or that you follow, not a global community list.

### Papers Feed

Automatically filters your timeline to posts containing academic links:
- arXiv, bioRxiv, medRxiv
- DOI.org links
- Semantic Scholar, OpenReview, ACL Anthology
- Nature, Science, PNAS, IEEE, ACM, Springer, Wiley

Auto-scans 5+ pages on load to find papers in your network.

### Full Bluesky Interactions

- **Reply** - Inline reply composer on any post
- **Like/Unlike** - Heart button with count
- **Repost/Unrepost** - Repost toggle
- **Quote Post** - Quote with your commentary + preview
- **Thread View** - Click any post to see full thread context (parents + replies)

### Additional Protections

- **High-Follower Filtering** - Hide posts from accounts following 5k/10k/20k+ people (often bots)
- **Dim Non-Verified** - Reduce visual prominence of non-researcher replies

---

## Quick Start

```bash
# Install
npm install

# Development
npm run dev

# Deploy
npx vercel --prod
```

### Required Environment Variables

```bash
# Bluesky bot account (manages lists)
LEA_BOT_HANDLE="your-bot.bsky.social"
LEA_BOT_PASSWORD="app-password-here"

# ORCID OAuth (for verification)
ORCID_CLIENT_ID="APP-XXXXXXXXX"
ORCID_CLIENT_SECRET="..."

# Vercel Postgres (auto-configured by Vercel)
POSTGRES_URL="..."
```

### Database Setup

```bash
npx drizzle-kit push
```

---

## Architecture

### Tech Stack

- **Next.js 16** + React + TypeScript
- **Tailwind CSS** for styling
- **Vercel Postgres** + Drizzle ORM
- **@atproto/api** for Bluesky

### Project Structure

```
app/
├── page.tsx                 # Main app
├── verify/page.tsx          # Verification flow
└── api/
    ├── researchers/         # Verified researcher CRUD
    ├── vouching/            # Vouch system (API ready)
    ├── community/           # Membership queries
    ├── graph/               # Social graph sync
    ├── list/                # Bluesky list management
    │   ├── uri/             # Get list URIs
    │   ├── sync/            # Sync community list
    │   └── personal/sync/   # Sync personal list on-demand
    ├── cron/                # Daily sync job
    └── orcid/               # OAuth callbacks

components/
├── Timeline.tsx            # Main feed
├── PapersFeed.tsx          # Papers-only feed
├── Post.tsx                # Post + interactions
├── ThreadView.tsx          # Thread modal
├── Composer.tsx            # Post composer
└── Settings.tsx            # Settings panel

lib/
├── bluesky.ts              # Bluesky API wrapper
├── settings.tsx            # Settings context
├── papers.ts               # Paper detection
├── verification.ts         # Auto-approval logic
├── openalex.ts             # OpenAlex API client
├── db/schema.ts            # Database schema
└── services/
    ├── graph-sync.ts       # Fetch follows from Bluesky
    ├── hop-computation.ts  # BFS for N-hop
    └── list-manager.ts     # Sync to Bluesky lists
```

### How Personal Community Lists Work

Each verified researcher gets their own personal community list:

1. **Graph Sync** - Fetches followers/following for each verified researcher
2. **Personal Hop Computation** - Finds everyone 1-hop from that specific user (their followers + who they follow)
3. **Personal List Sync** - Each user's community members added to their personal Bluesky list
4. **Threadgate** - Posts use the user's personal list to restrict replies

**Why per-user?** This ensures "My community" means YOUR network, not everyone connected to any verified researcher. You control who can reply based on your own social graph.

### Sync Schedule

- **Cron job**: Runs daily via Vercel cron (`GET /api/cron/sync-all`)
- **On verification**: Personal list synced immediately when you verify
- **On-demand**: `POST /api/list/personal/sync` with `{ "did": "..." }`

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `verified_researchers` | ORCID-verified accounts + personal list URIs |
| `social_graph` | Follow relationships (edges) |
| `community_members` | Computed N-hop membership (global) |
| `bluesky_lists` | Managed list metadata |
| `vouch_requests` | Vouching system (pending UI) |
| `sync_state` | Pagination cursors |

---

## API Reference

### Lists

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/list/uri?type=verified` | GET | Get verified-only list URI |
| `/api/list/uri?type=personal&did=X` | GET | Get user's personal list URI |
| `/api/list/uri?type=community` | GET | Get global community list URI |
| `/api/list/personal/sync` | POST | Sync personal list for a user |
| `/api/list/sync` | POST | Sync global community list |

### Researchers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/researchers` | GET | List all verified researchers |
| `/api/researchers/verify` | POST | Complete verification |

### Community

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/community/members` | GET | List community members |
| `/api/community/check?did=X` | GET | Check if DID is community member |

---

## Limitations

- **Incremental Sync**: Graph syncs in batches due to API rate limits. Full sync requires multiple cron cycles.
- **Database**: Using Vercel Postgres for MVP. Consider migrating for production scale.
- **Vouching UI**: API routes exist but no frontend yet.
- **Personal List Size**: Large networks may take multiple sync cycles to fully populate.

---

## Roadmap

- [x] ORCID verification
- [x] N-hop reply restrictions
- [x] Per-user personal community lists
- [x] Papers feed
- [x] Reply, like, repost, quote
- [x] Thread view
- [ ] Vouching UI
- [ ] Notifications
- [ ] Labeler service integration
- [ ] Profile view

---

## License

MIT
