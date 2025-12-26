/**
 * LEA Label Sync Worker
 *
 * Runs every minute to sync labels from Ozone to the LEA database.
 * Simple cron-based approach as a temporary alternative to WebSocket listener.
 */

const LEA_APP_URL = 'https://client-kappa-weld-68.vercel.app';

export default {
  // Cron trigger - runs on schedule
  async scheduled(event, env, ctx) {
    console.log('Running label sync...');

    try {
      const response = await fetch(`${LEA_APP_URL}/api/labeler/sync-to-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Sync complete:', result.message);
      } else {
        console.error('Sync failed:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Sync error:', error.message);
    }
  },

  // HTTP trigger - for manual testing
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/sync') {
      try {
        const response = await fetch(`${LEA_APP_URL}/api/labeler/sync-to-db`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('LEA Label Sync Worker\n\nGET /sync - Manual sync trigger', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
