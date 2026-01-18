import { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
import { Agent } from '@atproto/api';

// OAuth client singleton
let oauthClient: BrowserOAuthClient | null = null;
let currentSession: OAuthSession | null = null;

// Get the client ID based on environment
// For local development, use loopback client; for production, use the metadata URL
function getClientId(): string {
  if (typeof window === 'undefined') {
    return 'https://client-kappa-weld-68.vercel.app/client-metadata.json';
  }
  
  const origin = window.location.origin;
  
  // Check if running on localhost/127.0.0.1 for development
  if (origin.includes('127.0.0.1') || origin.includes('localhost')) {
    // Use loopback client for local development
    // This tells the OAuth server this is a development client
    return `http://localhost?redirect_uri=${encodeURIComponent(origin + '/')}&scope=${encodeURIComponent('atproto transition:generic')}`;
  }
  
  // Production: use the client metadata URL
  return 'https://client-kappa-weld-68.vercel.app/client-metadata.json';
}

// Initialize the OAuth client
async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) {
    return oauthClient;
  }
  
  const clientId = getClientId();
  
// For loopback/localhost, we need to pass clientMetadata directly
  if (clientId.startsWith('http://localhost?')) {
    oauthClient = new BrowserOAuthClient({
      handleResolver: 'https://bsky.social',
      clientMetadata: {
        client_id: clientId,
        redirect_uris: [window.location.origin + '/'],
        scope: 'atproto transition:generic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        application_type: 'web',
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true,
      },
    });
  } else {
    // Production: load from metadata URL
    oauthClient = await BrowserOAuthClient.load({
      clientId,
      handleResolver: 'https://bsky.social',
      // Use fragment response mode to keep tokens out of server logs
      responseMode: 'fragment',
    });
  }
  
  // Listen for session deletion events (e.g., token revocation)
  oauthClient.addEventListener('deleted', (event: { detail: { sub: string } }) => {
    if (currentSession?.sub === event.detail.sub) {
      currentSession = null;
      // Trigger page reload to show login screen
      window.location.reload();
    }
  });
  
  return oauthClient;
}

// Session event callbacks
type SessionCallback = (session: OAuthSession | null) => void;
const sessionCallbacks: SessionCallback[] = [];

export function onSessionChange(callback: SessionCallback): () => void {
  sessionCallbacks.push(callback);
  return () => {
    const index = sessionCallbacks.indexOf(callback);
    if (index > -1) {
      sessionCallbacks.splice(index, 1);
    }
  };
}

function notifySessionChange(session: OAuthSession | null) {
  for (const callback of sessionCallbacks) {
    callback(session);
  }
}

/**
 * Initialize OAuth - call this on app mount
 * Returns the session if one exists or was just created via callback
 * Returns null if no session and not a callback
 */
export async function initOAuth(): Promise<{ session: OAuthSession; isCallback: boolean } | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  
  try {
    const client = await getOAuthClient();
    
    // init() automatically handles:
    // 1. Restoring existing session from IndexedDB
    // 2. Processing OAuth callback if URL contains oauth params
    const result = await client.init();
    
    if (result?.session) {
      currentSession = result.session;
      notifySessionChange(currentSession);
      
      // Check if this was a callback (state is defined when redirected back)
      const isCallback = result.state !== undefined;
      
      // Clean up URL params after callback
      if (isCallback && window.history.replaceState) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
      
      return { session: result.session, isCallback };
    }
    
    return null;
  } catch (error) {
    console.error('OAuth init failed:', error);
    return null;
  }
}

/**
 * Start the OAuth login flow
 * This will redirect the user to their PDS for authentication
 */
export async function startLogin(handle: string): Promise<void> {
  const client = await getOAuthClient();
  
  // signIn will redirect to the PDS - this function won't return normally
  // The user will be redirected back to our app after authenticating
  await client.signIn(handle, {
    // Use the current URL as the redirect target
    // The OAuth client will handle storing state
  });
}

/**
 * Get the current OAuth session
 */
export function getOAuthSession(): OAuthSession | null {
  return currentSession;
}

/**
 * Get session info in a format compatible with the old session structure
 */
export function getSessionInfo(): { did: string; handle: string } | null {
  if (!currentSession) {
    return null;
  }
  
  return {
    did: currentSession.sub,
    handle: currentSession.sub, // Will be updated after profile fetch
  };
}

/**
 * Get an Agent instance from the current OAuth session
 * The OAuth session's fetch function handles authentication automatically
 */
export function getAgentFromSession(): Agent | null {
  if (!currentSession) {
    return null;
  }
  
  // Create an Agent using the session's authenticated fetch
  // The session handles DPoP tokens and refresh automatically
  const agent = new Agent(currentSession);
  
  return agent;
}

/**
 * Log out - revoke the current session
 */
export async function oauthLogout(): Promise<void> {
  if (!currentSession || !oauthClient) {
    currentSession = null;
    notifySessionChange(null);
    return;
  }
  
  try {
    await oauthClient.revoke(currentSession.sub);
  } catch (error) {
    console.error('OAuth revoke failed:', error);
  }
  
  currentSession = null;
  notifySessionChange(null);
}

/**
 * Check if there's an active session
 */
export function isLoggedIn(): boolean {
  return currentSession !== null;
}
