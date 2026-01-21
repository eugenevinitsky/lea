import { sql } from '@vercel/postgres';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import * as schema from '../../../lib/db/schema.js';

// Export db instance using the shared schema from main lea app
export const db = drizzle(sql, { schema });

// Re-export schema types and tables for convenience
export {
  verifiedResearchers,
  verifiedOrganizations,
  establishedVenues,
  auditLogs,
} from '../../../lib/db/schema.js';

export type {
  VerifiedResearcher,
  NewVerifiedResearcher,
  VerifiedOrganization,
  NewVerifiedOrganization,
  EstablishedVenue,
  NewEstablishedVenue,
  AuditLog,
  NewAuditLog,
} from '../../../lib/db/schema.js';

export default db;
