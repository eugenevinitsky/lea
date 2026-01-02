# Lea

A Bluesky client with protective defaults for researchers.

## TL;DR

| Feature | Description |
|---------|-------------|
| **ORCID Verification** | Link ORCID to verify researcher identity |
| **Reply Restrictions** | Auto-restrict replies to followers, verified researchers, or your connections |
| **Content Moderation** | Full support for Bluesky labelers - blur, warn, hide content based on your preferences |
| **Papers Feed** | Timeline filtered to academic paper links only |
| **Paper Discussions** | See all Bluesky conversations about any paper |
| **Researcher Profiles** | Rich profiles with affiliations, topics, publications, and mutual interactions |
| **Bookmarks + Export** | Save posts to collections, export paper citations to BibTeX/RIS for Zotero |
| **Direct Messages** | Built-in DM support |
| **Notifications** | Collapsible panel with likes, reposts, quotes, and replies |
| **Safety Panel** | Monitor your post reach, alerts for viral quotes, big account interactions |
| **Feed Discovery** | Browse and pin custom Bluesky feeds (horizontally scrollable) |
| **User Search** | Search all Bluesky users with verified researchers prioritized |

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
- Get labeled via the LEA labeler (`lea-community.bsky.social`)
- Get added to the "Verified Researchers" Bluesky list
- Get a personal connections list created
- Can restrict replies to only verified researchers or their connections

### Protective Threadgates

When posting, auto-apply reply restrictions:

| Option | Who Can Reply |
|--------|--------------|
| People you follow | Only accounts you follow |
| Verified researchers only | Only ORCID-verified researchers |
| My connections | Verified researchers + your followers/following |
| Anyone | No restrictions |

### Papers Feed

Automatically filters your timeline to posts containing academic links:
- arXiv, bioRxiv, medRxiv
- DOI.org links
- Semantic Scholar, OpenReview, ACL Anthology
- Nature, Science, PNAS, IEEE, ACM, Springer, Wiley

### Bookmarks & Citation Export

- Bookmark any post for later
- Organize bookmarks into **custom collections** (create, rename, delete, reorder)
- Bookmarks can belong to multiple collections
- Color-coded collapsible collection sections
- Export paper bookmarks to **BibTeX** (fetches real metadata from CrossRef/arXiv)
- Export to **RIS** for Zotero, Mendeley, EndNote
- Export raw **JSON** for backup

### Paper Discussions

Click "Discussion" on any paper post to see all Bluesky conversations about that paper:
- Aggregates all posts linking to the same paper
- Shows who's been discussing the paper
- Works with arXiv, DOI, ACM, Wiley, Nature, and 20+ academic sources
- Available on posts and in researcher profile paper lists
- **Paper Skygest integration**: Posts from the Paper Skygest feed automatically get paper labels and discussion links, even for domains not in our list

### Researcher Profiles

Rich profiles for verified researchers:
- **Affiliation** with links to browse all researchers at that institution
- **Research Topics** from OpenAlex, clickable to find similar researchers
- **Publication Venues** with links to browse by venue
- **ORCID & OpenAlex IDs** displayed and editable
- **My Papers** and **Papers I Recommend** sections with discussion links
- **Co-Authors** automatically fetched from OpenAlex
- **Posts & Papers tabs** to browse their Bluesky activity
- **Interactions tab** ("Us") showing mutual replies and mentions between you and the profile

### User Search

- Search all Bluesky users from the search bar
- Verified researchers appear first in results
- Shows avatars and verification badges
- Quick access to any user's profile

### Feed Discovery

- Browse popular Bluesky feeds
- Search for feeds by keyword
- Pin your favorite feeds to the sidebar
- Includes Paper Skygest (curated preprint digest) with automatic paper detection

### Direct Messages

- View and send DMs
- Real-time polling for new messages
- Integrated in the sidebar

### Notifications

- Collapsible notifications panel in sidebar
- Organized by category: Likes, Reposts, Quotes, Replies
- Shows text previews of posts that were interacted with
- Per-category toggles to enable/disable unread indicators
- Tracks "last viewed" per category to show new notifications

### Full Bluesky Interactions

- **Reply** - Inline reply composer on any post; thread auto-refreshes after replying
- **Like/Unlike** - Heart button with count
- **Repost/Unrepost** - Repost toggle with "Reposted by X" header on reposts
- **Quote Post** - Quote with your commentary + preview
- **Thread View** - Click any post to see full thread context; "View thread" only shows on posts with replies
- **Edit Threadgates** - Change reply restrictions on your existing posts
- **Delete Post** - Delete your own posts with confirmation
- **Share Post** - Copy Lea URL to clipboard

### Content Moderation

Lea fully supports Bluesky's content moderation system:

- **Labeler Subscriptions** - Respects all labelers you've subscribed to in your Bluesky settings
- **Content Filtering** - Posts with labels you've set to "hide" are automatically filtered out
- **Content Warnings** - Posts with labels set to "warn" show blur overlays with reveal option
- **Label Badges** - Labels appear on posts and profiles based on your preferences (only shows labels you've set to "show badge")
- **Profile Labels** - See labels on user profiles in feeds, hover cards, and profile pages
- **Clickable Labels** - Click any label to visit the labeler's profile on Bluesky

Labels are displayed with their human-readable names as defined by each labeler (e.g., "Adult Content" instead of "porn"). Labels respect your moderation settings - if you've turned a label off, it won't appear.

### Safety Panel

Monitor your post reach and get alerts:

- **Big Account Alerts** - Know when accounts with large followings reply, repost, or quote you
- **Viral Quote Alerts** - Get notified when quotes of your posts are gaining traction
- **Configurable Thresholds** - Set follower count thresholds for alerts
- **Discover Labelers** - Find and subscribe to new moderation labelers

### Additional Protections

- **High-Follower Filtering** - Hide posts from accounts following 5k/10k/20k+ people (often bots)
- **Dim Non-Verified** - Reduce visual prominence of non-researcher replies
- **Dim Reposts** - Reduce visual prominence of reposted content

### UI Enhancements

- **Following Indicator** - Blue ring around profile photos of people you follow
- **Modifier-Click Profiles** - Hold Shift, Cmd (Mac), or Ctrl (Windows/Linux) when clicking a username/avatar to open profile in new tab
- **Collapsible Sidebar Panels** - Bookmarks, DMs, and Notifications panels can be collapsed
- **Scrollable Feed Tabs** - Feed tabs bar scrolls horizontally when you have many feeds pinned

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

# Bluesky labeler account
LEA_LABELER_HANDLE="your-labeler.bsky.social"
LEA_LABELER_PASSWORD="app-password-here"

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

### Real-Time Sync with Jetstream

Instead of polling, LEA uses Bluesky's Jetstream for real-time label sync:

```
You label someone on Ozone
        ↓
Bluesky broadcasts event (<1 second)
        ↓
Jetstream listener receives it
        ↓
POSTs to /api/labeler/sync-to-db
        ↓
Researcher appears in LEA instantly
```

See `scripts/README.md` for Jetstream listener setup.

### Project Structure

```
app/
├── page.tsx                 # Main app
├── [handle]/page.tsx        # User profile page
├── paper/[id]/page.tsx      # Paper discussion page
├── topic/[value]/page.tsx   # Browse by research topic
├── affiliation/[value]/     # Browse by institution
├── venue/[value]/page.tsx   # Browse by publication venue
├── verify/page.tsx          # Verification flow
└── api/
    ├── researchers/         # Verified researcher CRUD
    │   ├── verify/          # Complete verification
    │   ├── suggestions/     # Researcher suggestions
    │   ├── manual-update/   # Admin updates
    │   ├── lookup-orcids/   # Batch ORCID lookup
    │   └── backfill-topics/ # Backfill research topics
    ├── labeler/             # Labeler integration
    │   ├── sync-to-db/      # Sync labels to database
    │   ├── sync-from-ozone/ # Pull from Ozone
    │   └── add-to-list/     # Add to Bluesky list
    ├── vouching/            # Vouch system
    ├── graph/               # Social graph sync
    ├── list/                # Bluesky list management
    ├── cron/                # Scheduled sync jobs
    ├── openalex/            # OpenAlex API proxy
    └── orcid/               # OAuth callbacks

components/
├── Timeline.tsx            # Main feed
├── PapersFeed.tsx          # Papers-only feed
├── Post.tsx                # Post + interactions
├── ThreadView.tsx          # Thread modal
├── Composer.tsx            # Post composer
├── ProfileView.tsx         # Researcher profile view
├── ProfileEditor.tsx       # Edit your profile
├── ProfileHoverCard.tsx    # Profile hover cards with labels
├── ProfileLabels.tsx       # Profile label display component
├── LabelBadges.tsx         # Post label badges
├── ModerationWrapper.tsx   # Content warning overlays
├── SafetyPanel.tsx         # Safety alerts panel
├── Bookmarks.tsx           # Bookmarks panel
├── DirectMessages.tsx      # DM interface
├── FeedBrowser.tsx         # Feed discovery
├── ResearcherSearch.tsx    # Search researchers
└── Settings.tsx            # Settings panel

lib/
├── bluesky.ts              # Bluesky API wrapper + moderation functions
├── moderation.tsx          # Moderation context, hooks, and helpers
├── papers.ts               # Paper URL detection & ID extraction
├── bookmarks.tsx           # Bookmarks + export (BibTeX, RIS)
├── settings.tsx            # Settings context
├── verification.ts         # Auto-approval logic
├── openalex.ts             # OpenAlex API client
├── db/schema.ts            # Database schema
└── services/
    ├── graph-sync.ts       # Fetch follows from Bluesky
    └── list-manager.ts     # Sync to Bluesky lists

scripts/
├── jetstream-listener.js  # Real-time label sync
└── README.md              # Deployment instructions
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `verified_researchers` | ORCID-verified accounts + personal list URIs + research topics + OpenAlex IDs |
| `researcher_profiles` | Extended profile data (bio, affiliation, links, papers) |
| `social_graph` | Follow relationships (edges) |
| `bluesky_lists` | Managed list metadata |
| `vouch_requests` | Vouching system |
| `sync_state` | Pagination cursors |

---

## API Reference

### Lists

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/list/uri?type=verified` | GET | Get verified-only list URI |
| `/api/list/uri?type=personal&did=X` | GET | Get user's personal list URI |
| `/api/list/personal/sync` | POST | Sync personal list for a user |
| `/api/list/sync` | POST | Sync verified list |

### Researchers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/researchers` | GET | List all verified researchers |
| `/api/researchers/verify` | POST | Complete verification |
| `/api/researchers/suggestions` | GET | Get researcher suggestions by topic |
| `/api/researchers/manual-update` | POST | Update researcher (ORCID or OpenAlex ID) |
| `/api/researchers/lookup-orcids` | POST | Batch lookup missing ORCIDs |
| `/api/researchers/backfill-topics` | POST | Backfill research topics from OpenAlex |
| `/api/researchers/by-field` | GET | Get researchers by topic/affiliation/venue |

### Profiles

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/profile?did=X` | GET | Get researcher's extended profile |
| `/api/profile` | POST | Update your profile |
| `/api/profile/ids` | POST | Update ORCID/OpenAlex IDs |

### Labeler

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/labeler/sync-to-db` | POST | Sync labels to database (full or single-DID) |
| `/api/labeler/sync-from-ozone` | POST | Pull labels from Ozone |

---

## Limitations

- **Vouching UI**: API routes exist but no frontend yet

---

## Roadmap

- [x] ORCID verification
- [x] Reply restrictions (followers, verified, connections)
- [x] Per-user personal connections lists
- [x] Papers feed
- [x] Reply, like, repost, quote
- [x] Thread view
- [x] Labeler integration
- [x] Bookmarks with BibTeX/RIS export
- [x] Direct messages
- [x] Feed discovery and pinning
- [x] Real-time sync via Jetstream
- [x] Researcher profiles with rich metadata
- [x] Paper discussion pages
- [x] Browse by topic/affiliation/venue
- [x] Profile interactions tab
- [x] User search (verified + all Bluesky users)
- [x] Threadgate editing on existing posts
- [x] Dim reposts option
- [x] Paper Skygest integration
- [x] Notifications panel
- [x] Delete/share posts
- [x] Thread auto-refresh after reply
- [x] Following indicator on avatars
- [x] Modifier-click to open profile in new tab (Shift/Cmd/Ctrl)
- [x] Collapsible sidebar panels
- [x] Horizontally scrollable feed tabs
- [x] Bookmark collections
- [x] Content moderation (labeler support with blur/warn/hide)
- [x] Safety panel (alerts for viral content, big accounts)
- [x] Label badges on posts and profiles
- [x] Clickable labels linking to labeler profiles
- [ ] Vouching UI

---

## License

MIT
