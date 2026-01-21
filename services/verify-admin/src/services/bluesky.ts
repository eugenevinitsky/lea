import { AtpAgent } from '@atproto/api';
import { config } from '../config.js';

export interface ResolvedHandle {
  did: string;
  handle: string;
}

export class BlueskyService {
  private agent: AtpAgent;

  constructor() {
    this.agent = new AtpAgent({
      service: config.bluesky.serviceUrl,
    });
  }

  /**
   * Resolve a Bluesky handle to a DID
   * Uses com.atproto.identity.resolveHandle
   */
  async resolveHandle(handle: string): Promise<ResolvedHandle | null> {
    // Normalize handle:
    // 1. Strip invisible Unicode characters (zero-width chars, directional marks, etc.)
    // 2. Remove @ prefix if present
    // 3. Trim whitespace
    // 4. Convert to lowercase
    // 5. Add .bsky.social if no domain is present
    let normalizedHandle = this.sanitizeHandle(handle);
    if (normalizedHandle.startsWith('@')) {
      normalizedHandle = normalizedHandle.slice(1);
    }
    
    // If no dot in handle, assume .bsky.social domain
    if (!normalizedHandle.includes('.')) {
      normalizedHandle = `${normalizedHandle}.bsky.social`;
    }
    
    try {
      const response = await this.agent.resolveHandle({ handle: normalizedHandle });
      
      if (response.success && response.data.did) {
        return {
          did: response.data.did,
          handle: normalizedHandle,
        };
      }
      
      console.error('resolveHandle returned success=false for handle:', normalizedHandle);
      return null;
    } catch (error) {
      // Log full error details for debugging
      const errorDetails = error instanceof Error 
        ? { message: error.message, name: error.name, stack: error.stack }
        : error;
      console.error('Failed to resolve handle:', normalizedHandle, errorDetails);
      return null;
    }
  }

  /**
   * Validate that a handle exists and is active
   */
  async validateHandle(handle: string): Promise<boolean> {
    const resolved = await this.resolveHandle(handle);
    return resolved !== null;
  }

  /**
   * Get profile information for a DID
   */
  async getProfile(didOrHandle: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null> {
    try {
      // Ensure we're logged in (getProfile now requires auth)
      if (!this.agent.session) {
        await this.loginAsLabeler();
      }
      
      const response = await this.agent.getProfile({ actor: didOrHandle });
      
      if (response.success) {
        return {
          did: response.data.did,
          handle: response.data.handle,
          displayName: response.data.displayName,
          avatar: response.data.avatar,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get profile:', error);
      return null;
    }
  }

  /**
   * Login to the labeler account (needed for applying labels)
   */
  async loginAsLabeler(): Promise<boolean> {
    try {
      if (!config.bluesky.labelerHandle || !config.bluesky.labelerPassword) {
        console.error('Labeler credentials not configured');
        return false;
      }

      await this.agent.login({
        identifier: config.bluesky.labelerHandle,
        password: config.bluesky.labelerPassword,
      });

      return true;
    } catch (error) {
      console.error('Failed to login as labeler:', error);
      return false;
    }
  }

  /**
   * Get the authenticated agent (must call loginAsLabeler first)
   */
  getAgent(): AtpAgent {
    return this.agent;
  }

  /**
   * Sanitize a handle by removing invisible Unicode characters
   * This handles copy-paste issues where invisible chars like:
   * - Zero-width spaces (U+200B)
   * - Zero-width non-joiner (U+200C)
   * - Zero-width joiner (U+200D)
   * - Left-to-right mark (U+200E)
   * - Right-to-left mark (U+200F)
   * - Left-to-right embedding (U+202A)
   * - Right-to-left embedding (U+202B)
   * - Pop directional formatting (U+202C)
   * - Left-to-right override (U+202D)
   * - Right-to-left override (U+202E)
   * - Word joiner (U+2060)
   * - Function application (U+2061)
   * - Invisible times (U+2062)
   * - Invisible separator (U+2063)
   * - Invisible plus (U+2064)
   * - Byte order mark (U+FEFF)
   * get accidentally included when copying from web pages or documents
   */
  private sanitizeHandle(handle: string): string {
    // Remove all Unicode control characters, format characters, and zero-width characters
    // This regex matches:
    // - \u200B-\u200F: zero-width and directional chars
    // - \u202A-\u202E: directional embedding/override
    // - \u2060-\u2064: word joiner and invisible operators  
    // - \uFEFF: byte order mark
    // - \u00AD: soft hyphen
    // - \u034F: combining grapheme joiner
    // - \u061C: Arabic letter mark
    // - \u115F-\u1160: Hangul fillers
    // - \u17B4-\u17B5: Khmer inherent vowels
    // - \u180E: Mongolian vowel separator
    // - \u3164: Hangul filler
    // - \uFFA0: Halfwidth Hangul filler
    return handle
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u3164\uFFA0]/g, '')
      .trim()
      .toLowerCase();
  }
}

// Singleton instance
export const blueskyService = new BlueskyService();
export default blueskyService;
