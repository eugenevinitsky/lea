import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // Server
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  
  // Bluesky / ATProto
  bluesky: {
    serviceUrl: optionalEnv('BLUESKY_SERVICE_URL', 'https://bsky.social'),
    labelerDid: process.env.BLUESKY_LABELER_DID || '',
    labelerHandle: process.env.BLUESKY_LABELER_HANDLE || '',
    labelerPassword: process.env.BLUESKY_LABELER_PASSWORD || '',
  },
  
  // Ozone
  ozone: {
    serviceUrl: process.env.OZONE_SERVICE_URL || '',
    adminDid: process.env.OZONE_ADMIN_DID || '',
    adminPassword: process.env.OZONE_ADMIN_PASSWORD || '',
  },
  
  // ORCID
  orcid: {
    clientId: process.env.ORCID_CLIENT_ID || '',
    clientSecret: process.env.ORCID_CLIENT_SECRET || '',
    redirectUri: process.env.ORCID_REDIRECT_URI || '',
    apiUrl: optionalEnv('ORCID_API_URL', 'https://pub.orcid.org/v3.0'),
  },
  
  // OpenAlex
  openalex: {
    apiUrl: optionalEnv('OPENALEX_API_URL', 'https://api.openalex.org'),
    email: process.env.OPENALEX_EMAIL || '',
  },
  
  // Frontend
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),
  
  // Admin
  adminApiKey: process.env.ADMIN_API_KEY || '',
  
  // Labels
  verifiedResearcherLabel: optionalEnv('VERIFIED_RESEARCHER_LABEL', 'verified-researcher'),
} as const;

// Validate critical config on startup (only in production)
export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    requireEnv('POSTGRES_URL');
    requireEnv('BLUESKY_LABELER_DID');
    requireEnv('BLUESKY_LABELER_PASSWORD');
    requireEnv('ADMIN_API_KEY');
  }
}

export default config;
