import { sql } from '@vercel/postgres';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import * as schema from './schema.js';

// Export db instance using local schema
export const db = drizzle(sql, { schema });

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
