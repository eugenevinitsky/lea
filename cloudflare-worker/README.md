# LEA Label Sync Worker

Simple Cloudflare Worker that syncs labels every minute.

## Deploy

```bash
cd cloudflare-worker

# Install wrangler if needed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy
```

## Test

After deploying, you can manually trigger a sync:

```bash
curl https://lea-label-sync.<your-account>.workers.dev/sync
```

## How it works

1. Cron runs every minute (`* * * * *`)
2. Worker calls `POST /api/labeler/sync-to-db` on Vercel app
3. Vercel app queries Ozone for all labels
4. Any new labeled researchers get added to database

## Limitations

- Not real-time (~1 minute delay)
- Polls even when no changes (inefficient but simple)

## Switch to real-time later

When you have Ozone access, deploy `scripts/jetstream-listener.js` there instead for true real-time sync.
