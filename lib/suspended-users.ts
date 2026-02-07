/**
 * Suspended user filtering
 *
 * - Login checks use isSuspended() (async, loads cache on first call)
 * - API auth checks use isSuspendedSync() (sync, fail-open if cache not loaded)
 * - Cache is loaded from the suspended_users table on first use
 */

import { db, suspendedUsers } from '@/lib/db';

// In-memory cache for fast lookups
let suspendedDidsCache: Set<string> | null = null;
let cacheLoadedAt: Date | null = null;

/**
 * Load suspended DIDs from database into memory cache
 */
async function loadSuspendedCache(): Promise<Set<string>> {
  const suspended = await db.select({ did: suspendedUsers.did }).from(suspendedUsers);
  suspendedDidsCache = new Set(suspended.map(s => s.did));
  cacheLoadedAt = new Date();
  console.log(`[SUSPENDED_USERS] Loaded ${suspendedDidsCache.size} suspended users from database`);
  return suspendedDidsCache;
}

/**
 * Check if a DID is suspended (async, loads cache on first call)
 */
export async function isSuspended(did: string): Promise<boolean> {
  if (!suspendedDidsCache) {
    await loadSuspendedCache();
  }
  return suspendedDidsCache!.has(did);
}

/**
 * Synchronous suspension check - only works if cache is already loaded
 * Returns false if cache not loaded (fail-open for safety during startup)
 */
export function isSuspendedSync(did: string): boolean {
  if (!suspendedDidsCache) {
    return false; // Fail open if cache not loaded
  }
  return suspendedDidsCache.has(did);
}

/**
 * Force reload the suspended users cache from database
 */
export async function refreshSuspendedCache(): Promise<void> {
  await loadSuspendedCache();
}

/**
 * Get cache stats for debugging
 */
export function getSuspendedCacheStats(): { size: number; loadedAt: Date | null } {
  return {
    size: suspendedDidsCache?.size ?? 0,
    loadedAt: cacheLoadedAt,
  };
}
