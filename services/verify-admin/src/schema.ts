/**
 * Database schema for verify-admin service.
 * This is a subset of the main lea app schema, containing only the tables
 * needed for the verification admin functionality.
 */

import {
  pgTable,
  varchar,
  timestamp,
  boolean,
  text,
  index,
} from 'drizzle-orm/pg-core';

// Verified researchers
export const verifiedResearchers = pgTable(
  'verified_researchers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    did: varchar('did', { length: 255 }).notNull().unique(),
    handle: varchar('handle', { length: 255 }),
    orcid: varchar('orcid', { length: 19 }),
    openAlexId: varchar('open_alex_id', { length: 100 }),
    website: varchar('website', { length: 500 }),
    name: varchar('name', { length: 255 }),
    institution: varchar('institution', { length: 500 }),
    researchTopics: text('research_topics'),
    verifiedAt: timestamp('verified_at').defaultNow().notNull(),
    verificationMethod: varchar('verification_method', { length: 50 }).notNull(),
    verifiedBy: varchar('verified_by', { length: 255 }),
    vouchedBy: varchar('vouched_by', { length: 36 }),
    isActive: boolean('is_active').default(true).notNull(),
    personalListUri: varchar('personal_list_uri', { length: 500 }),
    personalListSyncedAt: timestamp('personal_list_synced_at'),
  },
  (table) => [
    index('verified_researchers_did_idx').on(table.did),
    index('verified_researchers_orcid_idx').on(table.orcid),
  ]
);

// Organization type enum values
export const ORGANIZATION_TYPES = ['VENUE', 'LAB', 'ACADEMIC_INSTITUTION', 'INDUSTRY_INSTITUTION'] as const;
export type OrganizationType = typeof ORGANIZATION_TYPES[number];

// Verified organizations
export const verifiedOrganizations = pgTable(
  'verified_organizations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    did: varchar('did', { length: 255 }).notNull().unique(),
    handle: varchar('handle', { length: 255 }),
    organizationType: varchar('organization_type', { length: 50 }).notNull(),
    organizationName: varchar('organization_name', { length: 255 }).notNull(),
    website: varchar('website', { length: 500 }),
    labelApplied: boolean('label_applied').default(false).notNull(),
    verifiedAt: timestamp('verified_at').defaultNow().notNull(),
    verifiedBy: varchar('verified_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('verified_organizations_type_idx').on(table.organizationType),
  ]
);

// Established venues for OpenAlex publication matching
export const establishedVenues = pgTable(
  'established_venues',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 500 }).notNull(),
    openalexSourceId: varchar('openalex_source_id', { length: 100 }).unique(),
    issn: varchar('issn', { length: 20 }),
    venueType: varchar('venue_type', { length: 50 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => [
    index('established_venues_openalex_idx').on(table.openalexSourceId),
    index('established_venues_name_idx').on(table.name),
  ]
);

// Audit log for tracking admin verification actions
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    action: varchar('action', { length: 100 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    targetId: varchar('target_id', { length: 255 }),
    targetType: varchar('target_type', { length: 50 }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_target_idx').on(table.targetId),
    index('audit_logs_created_idx').on(table.createdAt),
  ]
);

// Type exports
export type VerifiedResearcher = typeof verifiedResearchers.$inferSelect;
export type NewVerifiedResearcher = typeof verifiedResearchers.$inferInsert;
export type VerifiedOrganization = typeof verifiedOrganizations.$inferSelect;
export type NewVerifiedOrganization = typeof verifiedOrganizations.$inferInsert;
export type EstablishedVenue = typeof establishedVenues.$inferSelect;
export type NewEstablishedVenue = typeof establishedVenues.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
