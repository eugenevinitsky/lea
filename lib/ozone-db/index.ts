import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Create a connection pool for the Ozone database
const ozonePool = new Pool({
  connectionString: process.env.OZONE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const ozoneDb = drizzle(ozonePool, { schema });

export * from './schema';
