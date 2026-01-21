/**
 * Migration script to export verified researchers from research-sky (Neon)
 * and import into lea (Supabase).
 * 
 * Usage:
 *   NEON_URL="postgresql://..." SUPABASE_URL="postgres://..." npx tsx scripts/migrate-from-neon.ts
 * 
 * Or create a .env.migration file with both URLs.
 */

import { config } from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'crypto';

// Load migration-specific env if exists
config({ path: '.env.migration' });
config(); // fallback to .env

const NEON_URL = process.env.NEON_URL || process.env.SOURCE_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.POSTGRES_URL;

if (!NEON_URL || !SUPABASE_URL) {
  console.error('Missing required environment variables:');
  console.error('  NEON_URL (or SOURCE_DATABASE_URL) - Neon database URL from research-sky');
  console.error('  SUPABASE_URL (or POSTGRES_URL) - Supabase database URL for lea');
  process.exit(1);
}

interface VerifiedResearcher {
  did: string;
  handle: string;
  name: string;
  orcid: string | null;
  openAlexId: string | null;
  website: string | null;
  verifiedAt: Date;
  verifiedBy: string | null;
}

interface VerifiedOrganization {
  did: string;
  handle: string;
  organizationName: string;
  organizationType: string;
  verifiedAt: Date;
  verifiedBy: string | null;
}

async function main() {
  console.log('🔄 Starting migration from Neon to Supabase...\n');
  
  // Connect to source (Neon)
  const sourceClient = new pg.Client({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });
  
  // Connect to target (Supabase)  
  const targetClient = new pg.Client({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    await sourceClient.connect();
    console.log('✓ Connected to source (Neon)');
    
    await targetClient.connect();
    console.log('✓ Connected to target (Supabase)\n');
    
    // --- Migrate Verified Researchers ---
    console.log('📋 Fetching verified researchers from Neon...');
    
    // Note: Neon uses "verified_members" table with slightly different column names
    const sourceResearchers = await sourceClient.query<{
      bluesky_did: string;
      bluesky_handle: string;
      display_name: string;
      orcid_id: string | null;
      openalex_id: string | null;
      website: string | null;
      verified_at: Date;
      verified_by: string | null;
    }>(`
      SELECT 
        bluesky_did, 
        bluesky_handle, 
        display_name, 
        orcid_id, 
        openalex_id,
        website,
        verified_at,
        verified_by
      FROM verified_members
    `);
    
    console.log(`   Found ${sourceResearchers.rows.length} researchers in source\n`);
    
    // Get existing researchers in target
    const existingResearchers = await targetClient.query<{ did: string }>(
      'SELECT did FROM verified_researchers'
    );
    const existingDids = new Set(existingResearchers.rows.map(r => r.did));
    console.log(`   Found ${existingDids.size} existing researchers in target\n`);
    
    // Filter to only new researchers
    const newResearchers = sourceResearchers.rows.filter(r => !existingDids.has(r.bluesky_did));
    console.log(`   ${newResearchers.length} new researchers to migrate\n`);
    
    if (newResearchers.length > 0) {
      let imported = 0;
      let errors = 0;
      
      for (const r of newResearchers) {
        try {
          await targetClient.query(`
            INSERT INTO verified_researchers (id, did, handle, name, orcid, open_alex_id, website, verified_at, verified_by, verification_method)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (did) DO NOTHING
          `, [
            randomUUID(),
            r.bluesky_did,
            r.bluesky_handle,
            r.display_name,
            r.orcid_id,
            r.openalex_id,
            r.website,
            r.verified_at,
            r.verified_by || 'migration',
            'manual', // Default verification method
          ]);
          imported++;
        } catch (err) {
          console.error(`   Error importing ${r.bluesky_handle}:`, err);
          errors++;
        }
      }
      
      console.log(`✓ Imported ${imported} researchers (${errors} errors)\n`);
    }
    
    // --- Migrate Verified Organizations ---
    console.log('📋 Fetching verified organizations from Neon...');
    
    try {
      const sourceOrgs = await sourceClient.query<{
        bluesky_did: string;
        bluesky_handle: string;
        organization_name: string;
        organization_type: string;
        verified_at: Date;
        verified_by: string | null;
      }>(`
        SELECT 
          bluesky_did,
          bluesky_handle,
          organization_name,
          organization_type,
          verified_at,
          verified_by
        FROM verified_organization
      `);
      
      console.log(`   Found ${sourceOrgs.rows.length} organizations in source\n`);
      
      // Get existing organizations in target
      const existingOrgs = await targetClient.query<{ did: string }>(
        'SELECT did FROM verified_organizations'
      );
      const existingOrgDids = new Set(existingOrgs.rows.map(o => o.did));
      
      const newOrgs = sourceOrgs.rows.filter(o => !existingOrgDids.has(o.bluesky_did));
      console.log(`   ${newOrgs.length} new organizations to migrate\n`);
      
      if (newOrgs.length > 0) {
        let importedOrgs = 0;
        let orgErrors = 0;
        
        for (const o of newOrgs) {
          try {
            await targetClient.query(`
              INSERT INTO verified_organizations (did, handle, organization_name, organization_type, verified_at, verified_by)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (did) DO NOTHING
            `, [
              o.bluesky_did,
              o.bluesky_handle,
              o.organization_name,
              o.organization_type,
              o.verified_at,
              o.verified_by || 'migration',
            ]);
            importedOrgs++;
          } catch (err) {
            console.error(`   Error importing org ${o.bluesky_handle}:`, err);
            orgErrors++;
          }
        }
        
        console.log(`✓ Imported ${importedOrgs} organizations (${orgErrors} errors)\n`);
      }
    } catch (err) {
      // Organization table might not exist in source
      console.log('   No organization table found in source (skipping)\n');
    }
    
    // --- Summary ---
    const finalResearchers = await targetClient.query('SELECT COUNT(*) FROM verified_researchers');
    const finalOrgs = await targetClient.query('SELECT COUNT(*) FROM verified_organizations');
    
    console.log('═══════════════════════════════════════');
    console.log('Migration complete!');
    console.log(`Total researchers in target: ${finalResearchers.rows[0].count}`);
    console.log(`Total organizations in target: ${finalOrgs.rows[0].count}`);
    console.log('═══════════════════════════════════════');
    
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

main();
