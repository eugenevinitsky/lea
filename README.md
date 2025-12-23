# Lea

A calmer Bluesky client for researchers. Lea provides protective defaults and verification features to create a safer social experience for the academic community.

## Features

- **Timeline View** - Browse your Bluesky feed
- **Auto-Threadgates** - Posts automatically restrict replies to people you follow (configurable)
- **Verified Researcher Badges** - Visual indicators for accounts with the `verified-researcher` label

## Getting Started

### Prerequisites

- Node.js 18+
- A Bluesky account
- An [app password](https://bsky.app/settings/app-passwords) (not your main password)

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

### Other Options

- **Netlify**: Connect GitHub repo or drag `.next` folder to [netlify.com/drop](https://netlify.com/drop)
- **Railway/Render**: Connect GitHub repo, auto-detects Next.js
- **Self-hosted**: Run `npm run build && npm start` behind nginx/caddy

## Project Structure

```
client/
├── app/
│   ├── page.tsx          # Main app (login/timeline view)
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── Login.tsx         # Bluesky authentication
│   ├── Timeline.tsx      # Feed display
│   ├── Post.tsx          # Single post with verified badge
│   └── Composer.tsx      # Post creation with auto-threadgate
└── lib/
    └── bluesky.ts        # ATProto client utilities
```

## Tech Stack

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [@atproto/api](https://github.com/bluesky-social/atproto) - Bluesky API client

## Roadmap

### Phase 1: Verification + Labeler (separate service)
- [ ] ORCID OAuth integration
- [ ] OpenAlex publication verification
- [ ] Labeler service for `verified-researcher` label
- [ ] Vouching system

### Phase 2: Client Features
- [x] Basic timeline and posting
- [x] Auto-threadgates on posts
- [x] Verified researcher badge display
- [ ] N-hop reply visibility filtering
- [ ] Auto-block high-follower accounts
- [ ] Escape velocity warnings
- [ ] "Papers from my network" feed

## Configuration

### Threadgate Options

When composing a post, you can toggle reply restrictions:

| Setting | Behavior |
|---------|----------|
| On (default) | Only accounts you follow can reply |
| Off | Anyone can reply |

Future versions will support restricting replies to verified researchers only.

## License

MIT
