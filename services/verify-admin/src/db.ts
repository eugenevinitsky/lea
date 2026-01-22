import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Supabase pooler uses certificates that may not be in the default CA chain.
// We need to explicitly configure SSL to accept them.
// Remove sslmode from connection string since we're configuring SSL via the ssl option.
const connectionString = (process.env.POSTGRES_URL || '').replace(/[?&]sslmode=[^&]*/g, '');

const pool = new pg.Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
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
