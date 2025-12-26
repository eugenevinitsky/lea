/**
 * LEA Label Sync Worker
 *
 * Runs every minute to sync labels from Ozone to:
 * 1. The LEA database (for app queries)
 * 2. The Bluesky list (for Graze feeds and threadgates)
 */

const LEA_APP_URL = 'https://client-kappa-weld-68.vercel.app';

async function syncToDb() {
  const response = await fetch(`${LEA_APP_URL}/api/labeler/sync-to-db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

async function syncList() {
  const response = await fetch(`${LEA_APP_URL}/api/labeler/sync-from-labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

export default {
  // Cron trigger - runs on schedule
  async scheduled(event, env, ctx) {
    console.log('Running label sync...');

    try {
      // Sync to database
      const dbResult = await syncToDb();
      console.log('DB sync:', dbResult.message || 'complete');

      // Sync to Bluesky list
      const listResult = await syncList();
      console.log('List sync:', `${listResult.added} added, ${listResult.removed} removed`);
    } catch (error) {
      console.error('Sync error:', error.message);
    }
  },

  // HTTP trigger - for manual testing
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/sync') {
      try {
        const dbResult = await syncToDb();
        const listResult = await syncList();

        return new Response(JSON.stringify({
          database: dbResult,
          list: listResult,
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('LEA Label Sync Worker\n\nGET /sync - Manual sync trigger (syncs DB + list)', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
