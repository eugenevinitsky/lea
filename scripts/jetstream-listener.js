#!/usr/bin/env node

/**
 * Jetstream Listener for LEA
 *
 * Subscribes to Bluesky's Jetstream firehose and listens for label events
 * from the LEA labeler. When a verified-researcher label is added or removed,
 * it notifies the Vercel app to sync the database.
 *
 * Usage:
 *   node jetstream-listener.js
 *
 * Environment variables:
 *   LEA_APP_URL - Your Vercel app URL (default: https://client-kappa-weld-68.vercel.app)
 *   LEA_LABELER_DID - The labeler's DID (default: did:plc:7c7tx56n64jhzezlwox5dja6)
 *   LEA_SYNC_SECRET - Optional secret to authenticate sync requests
 *
 * Run with pm2 for production:
 *   pm2 start jetstream-listener.js --name lea-jetstream
 */

const WebSocket = require('ws');

// Configuration
const CONFIG = {
  jetstreamUrl: 'wss://jetstream2.us-east.bsky.network/subscribe',
  labelerDid: process.env.LEA_LABELER_DID || 'did:plc:7c7tx56n64jhzezlwox5dja6',
  appUrl: process.env.LEA_APP_URL || 'https://client-kappa-weld-68.vercel.app',
  syncSecret: process.env.LEA_SYNC_SECRET || '',
  reconnectDelay: 5000, // 5 seconds
  labelValue: 'verified-researcher',
};

let ws = null;
let reconnectTimeout = null;

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Notify the Vercel app to sync a specific DID
async function notifySync(subjectDid, action) {
  try {
    log(`Notifying app: ${action} label for ${subjectDid}`);

    const response = await fetch(`${CONFIG.appUrl}/api/labeler/sync-to-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONFIG.syncSecret && { 'Authorization': `Bearer ${CONFIG.syncSecret}` }),
      },
      body: JSON.stringify({
        did: subjectDid,
        action, // 'add' or 'remove'
      }),
    });

    if (response.ok) {
      const result = await response.json();
      log(`Sync successful`, result);
    } else {
      log(`Sync failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    log(`Sync error: ${error.message}`);
  }
}

function connect() {
  // Build subscription URL with filter for label events
  // We want all label events, then filter by source DID in the handler
  const url = new URL(CONFIG.jetstreamUrl);
  url.searchParams.set('wantedCollections', 'com.atproto.label.label');

  log(`Connecting to Jetstream...`);
  log(`Filtering for labels from: ${CONFIG.labelerDid}`);

  ws = new WebSocket(url.toString());

  ws.on('open', () => {
    log('Connected to Jetstream');
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      // We're looking for label events
      if (event.kind !== 'commit') return;
      if (event.commit?.collection !== 'com.atproto.label.label') return;

      // Check if this label is from our labeler
      // Labels have a 'src' field indicating who created them
      const record = event.commit?.record;
      if (!record) return;

      // For label events, the 'did' field is the labeler
      // and the record contains the label details
      if (event.did !== CONFIG.labelerDid) return;

      // Check if it's a verified-researcher label
      if (record.val !== CONFIG.labelValue) return;

      const subjectDid = record.uri?.split('/')[2] || record.sub;
      if (!subjectDid) return;

      const action = event.commit.operation === 'delete' ? 'remove' : 'add';

      log(`Label event detected`, {
        subject: subjectDid,
        label: record.val,
        action,
      });

      // Notify the app
      notifySync(subjectDid, action);

    } catch (error) {
      // Ignore parse errors for malformed messages
    }
  });

  ws.on('close', (code, reason) => {
    log(`Disconnected from Jetstream: ${code} ${reason}`);
    scheduleReconnect();
  });

  ws.on('error', (error) => {
    log(`WebSocket error: ${error.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) return;

  log(`Reconnecting in ${CONFIG.reconnectDelay / 1000} seconds...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, CONFIG.reconnectDelay);
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down...');
  if (ws) ws.close();
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...');
  if (ws) ws.close();
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  process.exit(0);
});

// Start
log('LEA Jetstream Listener starting...');
log(`App URL: ${CONFIG.appUrl}`);
log(`Labeler DID: ${CONFIG.labelerDid}`);
connect();
