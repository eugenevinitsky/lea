# LEA Jetstream Listener

Real-time sync of verified researcher labels from Bluesky.

## What it does

Instead of polling once per day, this script:
1. Connects to Bluesky's Jetstream (real-time event stream)
2. Listens for label events from the LEA labeler
3. Instantly notifies the Vercel app when someone is verified/unverified

## Setup on Ozone EC2

### 1. Copy the script to your server

```bash
scp scripts/jetstream-listener.js ubuntu@your-ozone-server:~/
```

### 2. SSH into the server and install dependencies

```bash
ssh ubuntu@your-ozone-server
npm install ws
```

### 3. Test it

```bash
node jetstream-listener.js
```

You should see:
```
[timestamp] LEA Jetstream Listener starting...
[timestamp] App URL: https://client-kappa-weld-68.vercel.app
[timestamp] Labeler DID: did:plc:7c7tx56n64jhzezlwox5dja6
[timestamp] Connecting to Jetstream...
[timestamp] Connected to Jetstream
```

### 4. Run with PM2 (keeps it running)

```bash
# Install pm2 if you don't have it
npm install -g pm2

# Start the listener
pm2 start jetstream-listener.js --name lea-jetstream

# Make it restart on server reboot
pm2 save
pm2 startup
```

### 5. Monitor

```bash
pm2 logs lea-jetstream  # View logs
pm2 status              # Check if running
pm2 restart lea-jetstream  # Restart if needed
```

## Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `LEA_APP_URL` | `https://client-kappa-weld-68.vercel.app` | Your Vercel app URL |
| `LEA_LABELER_DID` | `did:plc:7c7tx56n64jhzezlwox5dja6` | The labeler's DID |
| `LEA_SYNC_SECRET` | (empty) | Optional auth secret |

Example with custom URL:
```bash
LEA_APP_URL=https://your-app.vercel.app pm2 start jetstream-listener.js --name lea-jetstream
```

## How it works

```
You label someone on Ozone
        ↓
Bluesky network broadcasts label event
        ↓
Jetstream forwards to our listener
        ↓
Listener POSTs to /api/labeler/sync-to-db
        ↓
Vercel app adds researcher to database
        ↓
User appears in LEA immediately
```

Latency: <1 second from labeling to appearing in the app.
