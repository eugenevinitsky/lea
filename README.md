# Lea

A calmer Bluesky client for researchers. Lea provides protective defaults and verification features to create a safer social experience for the academic community.

## Features

- **Timeline View** - Browse your Bluesky feed
- **Papers Feed** - Filter timeline to show only posts with academic paper links (arXiv, DOI, Nature, etc.)
- **Auto-Threadgates** - Posts automatically restrict replies (configurable: followers, verified community, or open)
- **Verified Researcher Badges** - Visual indicators for accounts with the `verified-researcher` label
- **ORCID Verification** - Verify researcher status via ORCID OAuth + OpenAlex publication history
- **N-Hop Reply Restrictions** - Restrict replies to verified researchers and their 2-hop social network
- **Vouching System** - Verified researchers can vouch for colleagues
- **High-Follower Filtering** - Hide posts from accounts following many people (often bots)

## Getting Started

### Prerequisites

- Node.js 18+
- A Bluesky account
- An [app password](https://bsky.app/settings/app-passwords) (not your main password)
- (Optional) Vercel Postgres for N-hop features
- (Optional) ORCID developer credentials for verification

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Deployment

### Vercel (Recommended)

```bash
# First time setup
npx vercel login
npx vercel

# Subsequent deploys
npx vercel --prod
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for automatic deploys on push.

### Database Setup (Required for N-Hop Features)

The N-hop reply restrictions and verification storage require a PostgreSQL database. Currently using Vercel Postgres for MVP.

> **Note:** Vercel Postgres is used for rapid prototyping. For production, consider migrating to a more scalable solution like Supabase, PlanetScale, or a dedicated PostgreSQL instance.

1. Connect Vercel Postgres from your Vercel dashboard
2. Run database migrations:
   ```bash
   npx drizzle-kit push
   ```
3. Set environment variables:
   ```bash
   POSTGRES_URL="..."
   LEA_BOT_HANDLE="your-bot.bsky.social"
   LEA_BOT_PASSWORD="..."
   ```

### ORCID Setup (For Verification)

1. Register at [ORCID Developer Tools](https://orcid.org/developer-tools)
2. Add environment variables:
   ```bash
   ORCID_CLIENT_ID="APP-XXXXXXXXX"
   ORCID_CLIENT_SECRET="..."
   ORCID_SANDBOX=false  # true for testing
   ```

### Other Options

- **Netlify**: Connect GitHub repo or drag `.next` folder to [netlify.com/drop](https://netlify.com/drop)
- **Railway/Render**: Connect GitHub repo, auto-detects Next.js
- **Self-hosted**: Run `npm run build && npm start` behind nginx/caddy

## Project Structure

```
client/
├── app/
│   ├── page.tsx              # Main app (login/timeline view)
│   ├── verify/page.tsx       # Researcher verification page
│   ├── api/
│   │   ├── researchers/      # Verification API routes
│   │   ├── vouching/         # Vouch request/approve/reject
│   │   ├── community/        # Community member queries
│   │   ├── graph/            # Social graph sync
│   │   ├── list/             # Bluesky list management
│   │   ├── cron/             # Background sync jobs
│   │   ├── orcid/            # ORCID OAuth
│   │   └── openalex/         # OpenAlex API proxy
│   └── layout.tsx
├── components/
│   ├── Login.tsx             # Bluesky authentication
│   ├── Timeline.tsx          # Feed display with filtering
│   ├── PapersFeed.tsx        # Academic papers feed
│   ├── Post.tsx              # Post with verified badge & paper indicators
│   ├── Composer.tsx          # Post creation with threadgate options
│   └── Settings.tsx          # User preferences
├── lib/
│   ├── bluesky.ts            # ATProto client utilities
│   ├── settings.tsx          # Settings context
│   ├── papers.ts             # Paper link detection
│   ├── verification.ts       # Auto-approval logic
│   ├── openalex.ts           # OpenAlex API client
│   ├── db/
│   │   ├── schema.ts         # Database schema (Drizzle)
│   │   └── index.ts          # Database connection
│   └── services/
│       ├── graph-sync.ts     # Social graph fetching
│       ├── hop-computation.ts # N-hop BFS algorithm
│       └── list-manager.ts   # Bluesky list CRUD
└── vercel.json               # Cron job configuration
```

## Tech Stack

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [@atproto/api](https://github.com/bluesky-social/atproto) - Bluesky API client

## Roadmap

### Phase 1: Verification + Labeler
- [x] ORCID OAuth integration
- [x] OpenAlex publication verification
- [x] Auto-approval eligibility checking
- [x] Vouching system (API)
- [ ] Labeler service for `verified-researcher` label (Ozone)

### Phase 2: Client Features
- [x] Basic timeline and posting
- [x] Auto-threadgates on posts
- [x] Verified researcher badge display
- [x] N-hop reply restrictions (verified community threadgate)
- [x] Hide high-follower accounts
- [x] "Papers from my network" feed
- [ ] Escape velocity warnings
- [ ] Auto-block (actually block, not just hide)

### Phase 3: Production Readiness
- [ ] Migrate to permanent database solution
- [ ] Labeler integration
- [ ] User-facing vouching UI
- [ ] Community member list UI

## Configuration

### Threadgate Options

When composing a post, you can choose who can reply:

| Setting | Behavior |
|---------|----------|
| People you follow | Only accounts you follow can reply |
| Verified community | Only verified researchers + 2-hop connections can reply |
| Anyone | No restrictions on replies |

The "Verified community" option requires database setup and a bot account to manage the community list.

## License

MIT
