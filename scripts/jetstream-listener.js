#!/usr/bin/env node

/**
 * Label Subscription Listener for LEA
 *
 * Subscribes to the LEA labeler's label stream and listens for
 * verified-researcher labels. When a label is added or removed,
 * it notifies the Vercel app to sync the database.
 *
 * Usage:
 *   node jetstream-listener.js
 *
 * Environment variables:
 *   LEA_APP_URL - Your Vercel app URL (default: https://client-kappa-weld-68.vercel.app)
 *   LEA_LABELER_DID - The labeler's DID (default: did:plc:7c7tx56n64jhzezlwox5dja6)
 *   INTERNAL_API_SECRET - Secret for authenticating with the sync endpoint (required)
 *
 * Run with pm2 for production:
 *   pm2 start jetstream-listener.js --name lea-labels
 */

const WebSocket = require('ws');
const cbor = require('cbor');

// Configuration
const CONFIG = {
  labelerDid: process.env.LEA_LABELER_DID || 'did:plc:7c7tx56n64jhzezlwox5dja6',
  appUrl: process.env.LEA_APP_URL || 'https://client-kappa-weld-68.vercel.app',
  internalSecret: process.env.INTERNAL_API_SECRET,
  reconnectDelay: 5000,
  labelValue: 'verified-researcher',
};

// Validate required config
if (!CONFIG.internalSecret) {
  console.error('ERROR: INTERNAL_API_SECRET environment variable is required');
  process.exit(1);
}

let ws = null;
let reconnectTimeout = null;
let labelerEndpoint = null;

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Get the labeler's service endpoint from PLC directory
async function getLabelerEndpoint() {
  try {
    const response = await fetch(`https://plc.directory/${CONFIG.labelerDid}`);
    if (!response.ok) return null;

    const data = await response.json();
    // Look for the labeler service endpoint
    const labelerService = data.service?.find(s => s.id === '#atproto_labeler');
    return labelerService?.serviceEndpoint || null;
  } catch (error) {
    log(`Error fetching labeler endpoint: ${error.message}`);
    return null;
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
        'Authorization': `Bearer ${CONFIG.internalSecret}`,
      },
      body: JSON.stringify({
        did: subjectDid,
        action,
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

// Decode CBOR message
function decodeMessage(data) {
  try {
    // Ensure we have a Buffer
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // AT Protocol subscriptions send framed messages with header + body
    // Try decoding all CBOR items in the message
    const decoded = cbor.decodeAllSync(buffer);

    // Usually returns [header, body] where body contains the labels
    if (decoded.length >= 2) {
      return { header: decoded[0], body: decoded[1] };
    } else if (decoded.length === 1) {
      return decoded[0];
    }
    return null;
  } catch (error) {
    log(`CBOR decode error: ${error.message}`);
    // Log first few bytes for debugging
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    log(`First 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
    return null;
  }
}

async function connect() {
  // Get labeler endpoint if not cached
  if (!labelerEndpoint) {
    labelerEndpoint = await getLabelerEndpoint();
    if (!labelerEndpoint) {
      log('Could not find labeler endpoint, retrying...');
      scheduleReconnect();
      return;
    }
    log(`Found labeler endpoint: ${labelerEndpoint}`);
  }

  // Subscribe to label stream
  const wsUrl = labelerEndpoint.replace('https://', 'wss://') + '/xrpc/com.atproto.label.subscribeLabels';
  log(`Connecting to ${wsUrl}...`);

  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    log('Connected to labeler subscription');
  });

  ws.on('message', (data) => {
    try {
      const message = decodeMessage(data);
      if (!message) {
        return;
      }

      // Log the message structure for debugging
      log(`Received message`, message);

      // Handle label message - structure may vary
      const labels = message.labels || (message.body?.labels) || [];

      for (const label of labels) {
        // Check if it's our label type
        if (label.val === CONFIG.labelValue) {
          // Subject DID is in 'uri' field (the account being labeled)
          const subjectDid = label.uri;
          // 'neg' field indicates label removal (negation)
          const action = label.neg ? 'remove' : 'add';

          log(`Label event detected!`, {
            subject: subjectDid,
            label: label.val,
            action,
          });

          notifySync(subjectDid, action);
        }
      }
    } catch (error) {
      log(`Message processing error: ${error.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    log(`Disconnected: ${code} ${reason}`);
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
log('LEA Label Listener starting...');
log(`App URL: ${CONFIG.appUrl}`);
log(`Labeler DID: ${CONFIG.labelerDid}`);
connect();
