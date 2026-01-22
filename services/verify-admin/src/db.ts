import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Supabase requires SSL but has self-signed certs in some environments
const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false,
});

// Log connection status on startup
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  console.log('Database pool connected');
});

// Export db instance using local schema
export const db = drizzle(pool, { schema });

// Re-export schema types and tables for convenience
export {
  verifiedResearchers,
  verifiedOrganizations,
  establishedVenues,
  auditLogs,
} from './schema.js';

export type {
  VerifiedResearcher,
  NewVerifiedResearcher,
  VerifiedOrganization,
  NewVerifiedOrganization,
  EstablishedVenue,
  NewEstablishedVenue,
  AuditLog,
  NewAuditLog,
} from './schema.js';

export default db;
