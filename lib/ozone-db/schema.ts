import {
  pgTable,
  varchar,
  timestamp,
  integer,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

// Verified members from Ozone's database
export const verifiedMembers = pgTable('verified_members', {
  id: uuid('id').primaryKey(),
  blueskyDid: varchar('bluesky_did', { length: 255 }).notNull().unique(),
  blueskyHandle: varchar('bluesky_handle', { length: 255 }),
  orcidId: varchar('orcid_id', { length: 19 }),
  displayName: varchar('display_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  vouchesRemaining: integer('vouches_remaining').default(5),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  openalexId: varchar('openalex_id', { length: 255 }),
});

// Vouches table
export const vouches = pgTable('vouches', {
  id: uuid('id').primaryKey(),
  voucherId: uuid('voucher_id').notNull(),
  vouchedId: uuid('vouched_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Applications for verification
export const applications = pgTable('applications', {
  id: uuid('id').primaryKey(),
  blueskyDid: varchar('bluesky_did', { length: 255 }).notNull(),
  blueskyHandle: varchar('bluesky_handle', { length: 255 }),
  orcidId: varchar('orcid_id', { length: 19 }),
  displayName: varchar('display_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Verifications (verification records)
export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey(),
  memberId: uuid('member_id').notNull(),
  verificationType: varchar('verification_type', { length: 50 }),
  verifiedAt: timestamp('verified_at').defaultNow(),
  verifiedBy: varchar('verified_by', { length: 255 }),
});

// Audit logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey(),
  action: varchar('action', { length: 100 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }),
  targetId: varchar('target_id', { length: 255 }),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Type exports
export type VerifiedMember = typeof verifiedMembers.$inferSelect;
export type Vouch = typeof vouches.$inferSelect;
export type Application = typeof applications.$inferSelect;
