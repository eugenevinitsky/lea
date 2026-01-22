import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import tls from 'tls';
import * as schema from './schema.js';

// Supabase pooler uses certificates that may not be in the default CA chain.
// We configure SSL to not reject unauthorized certificates.
const connectionString = process.env.POSTGRES_URL || '';

console.log('Database connection string (masked):', connectionString.replace(/:[^@]+@/, ':***@'));
console.log('SSL config: { rejectUnauthorized: false }');

const pool = new pg.Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
    // Explicitly set checkServerIdentity to skip hostname verification
    checkServerIdentity: () => undefined,
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
