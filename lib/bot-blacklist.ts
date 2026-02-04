/**
 * Bot account filtering for ingestion and display
 *
 * - Display queries use NOT EXISTS against the bot_accounts table (efficient SQL)
 * - Ingestion uses an in-memory Set for fast O(1) lookups
 * - The Set is loaded from the database on first use
 */

import { db, botAccounts } from '@/lib/db';

// In-memory cache for fast ingestion lookups
let botDidsCache: Set<string> | null = null;
let cacheLoadedAt: Date | null = null;

/**
 * Load bot DIDs from database into memory cache
 * Called automatically on first use
 */
async function loadBotCache(): Promise<Set<string>> {
  const bots = await db.select({ did: botAccounts.did }).from(botAccounts);
  botDidsCache = new Set(bots.map(b => b.did));
  cacheLoadedAt = new Date();
  console.log(`[BOT_BLACKLIST] Loaded ${botDidsCache.size} bots from database`);
  return botDidsCache;
}

/**
 * Check if a DID belongs to a known bot (for ingestion)
 * Uses in-memory cache for O(1) lookups
 */
export async function isBot(did: string): Promise<boolean> {
  if (!botDidsCache) {
    await loadBotCache();
  }
  return botDidsCache!.has(did);
}

/**
 * Synchronous bot check - only works if cache is already loaded
 * Returns false if cache not loaded (fail-open for safety during startup)
 */
export function isBotSync(did: string): boolean {
  if (!botDidsCache) {
    return false; // Fail open if cache not loaded
  }
  return botDidsCache.has(did);
}

/**
 * Force reload the bot cache from database
 */
export async function refreshBotCache(): Promise<void> {
  await loadBotCache();
}

/**
 * Get cache stats for debugging
 */
export function getBotCacheStats(): { size: number; loadedAt: Date | null } {
  return {
    size: botDidsCache?.size ?? 0,
    loadedAt: cacheLoadedAt,
  };
}
