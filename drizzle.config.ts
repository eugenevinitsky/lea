import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load from .env.local for local development
config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
    ssl: 'require',
  },
});
