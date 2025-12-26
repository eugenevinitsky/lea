import {
  pgTable,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// Verified researchers (hop 0)
export const verifiedResearchers = pgTable(
  'verified_researchers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    did: varchar('did', { length: 255 }).notNull().unique(),
    handle: varchar('handle', { length: 255 }),
    orcid: varchar('orcid', { length: 19 }).notNull(),
    name: varchar('name', { length: 255 }),
    institution: varchar('institution', { length: 500 }),
    // Research topics extracted from OpenAlex (JSON array of strings)
    researchTopics: text('research_topics'), // JSON array: ["Machine Learning", "Computer Vision", ...]
    verifiedAt: timestamp('verified_at').defaultNow().notNull(),
    verificationMethod: varchar('verification_method', { length: 50 }).notNull(), // 'auto' | 'vouched' | 'manual'
    vouchedBy: varchar('vouched_by', { length: 36 }), // FK to verified_researchers.id
    isActive: boolean('is_active').default(true).notNull(),
    // Personal community list for this researcher's 1-hop connections
    personalListUri: varchar('personal_list_uri', { length: 500 }),
    personalListSyncedAt: timestamp('personal_list_synced_at'),
  },
  (table) => [
    index('verified_researchers_did_idx').on(table.did),
    index('verified_researchers_orcid_idx').on(table.orcid),
  ]
);

// Social graph edges (followers/following relationships)
export const socialGraph = pgTable(
  'social_graph',
  {
    followerId: varchar('follower_id', { length: 255 }).notNull(),
    followingId: varchar('following_id', { length: 255 }).notNull(),
    discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
    lastVerified: timestamp('last_verified').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index('social_graph_follower_idx').on(table.followerId),
    index('social_graph_following_idx').on(table.followingId),
  ]
);

// Community members (computed: people within N hops)
export const communityMembers = pgTable(
  'community_members',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    did: varchar('did', { length: 255 }).notNull().unique(),
    handle: varchar('handle', { length: 255 }),
    hopDistance: integer('hop_distance').notNull(), // 0 = verified, 1 = 1-hop, 2 = 2-hop
    closestVerifiedDid: varchar('closest_verified_did', { length: 255 }),
    computedAt: timestamp('computed_at').defaultNow().notNull(),
    addedToListAt: timestamp('added_to_list_at'),
    listItemUri: varchar('list_item_uri', { length: 500 }),
  },
  (table) => [
    index('community_members_did_idx').on(table.did),
    index('community_members_hop_idx').on(table.hopDistance),
  ]
);

// Vouch requests (pending vouches)
export const vouchRequests = pgTable(
  'vouch_requests',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    requesterDid: varchar('requester_did', { length: 255 }).notNull(),
    requesterHandle: varchar('requester_handle', { length: 255 }),
    voucherDid: varchar('voucher_did', { length: 255 }).notNull(),
    message: text('message'),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'approved' | 'rejected'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    index('vouch_requests_requester_idx').on(table.requesterDid),
    index('vouch_requests_voucher_idx').on(table.voucherDid),
  ]
);

// Bluesky list metadata
export const blueskyLists = pgTable('bluesky_lists', {
  id: varchar('id', { length: 36 }).primaryKey(),
  ownerDid: varchar('owner_did', { length: 255 }).notNull(),
  listUri: varchar('list_uri', { length: 500 }).notNull().unique(),
  listCid: varchar('list_cid', { length: 100 }),
  name: varchar('name', { length: 255 }).notNull(),
  purpose: varchar('purpose', { length: 100 }).notNull(), // 'community_members'
  memberCount: integer('member_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Sync state for tracking API pagination
export const syncState = pgTable('sync_state', {
  id: varchar('id', { length: 100 }).primaryKey(),
  cursor: varchar('cursor', { length: 500 }),
  lastSyncAt: timestamp('last_sync_at'),
  status: varchar('status', { length: 20 }).default('idle'), // 'idle' | 'in_progress' | 'complete' | 'error'
  errorMessage: text('error_message'),
});

// Type exports
export type VerifiedResearcher = typeof verifiedResearchers.$inferSelect;
export type NewVerifiedResearcher = typeof verifiedResearchers.$inferInsert;
export type SocialGraphEdge = typeof socialGraph.$inferSelect;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type VouchRequest = typeof vouchRequests.$inferSelect;
export type BlueskyList = typeof blueskyLists.$inferSelect;
