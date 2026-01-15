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

// Verified researchers
export const verifiedResearchers = pgTable(
  'verified_researchers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    did: varchar('did', { length: 255 }).notNull().unique(),
    handle: varchar('handle', { length: 255 }),
    orcid: varchar('orcid', { length: 19 }).notNull(),
    openAlexId: varchar('open_alex_id', { length: 100 }), // e.g., "A5023888391"
    name: varchar('name', { length: 255 }),
    institution: varchar('institution', { length: 500 }),
    // Research topics extracted from OpenAlex (JSON array of strings)
    researchTopics: text('research_topics'), // JSON array: ["Machine Learning", "Computer Vision", ...]
    verifiedAt: timestamp('verified_at').defaultNow().notNull(),
    verificationMethod: varchar('verification_method', { length: 50 }).notNull(), // 'auto' | 'vouched' | 'manual'
    vouchedBy: varchar('vouched_by', { length: 36 }), // FK to verified_researchers.id
    isActive: boolean('is_active').default(true).notNull(),
    // Personal community list for this researcher's connections
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

// Community members (legacy table - preserved to prevent data loss)
export const communityMembers = pgTable('community_members', {
  id: varchar('id', { length: 36 }).primaryKey(),
  did: varchar('did', { length: 255 }).notNull(),
  handle: varchar('handle', { length: 255 }),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  hopDistance: integer('hop_distance'),
  closestVerifiedDid: varchar('closest_verified_did', { length: 255 }),
  computedAt: timestamp('computed_at'),
  addedToListAt: timestamp('added_to_list_at'),
  listItemUri: varchar('list_item_uri', { length: 500 }),
});

// Researcher profiles (extended profile data for verified researchers)
export const researcherProfiles = pgTable('researcher_profiles', {
  did: varchar('did', { length: 255 }).primaryKey(), // Must be a verified researcher
  shortBio: text('short_bio'), // ~280 chars
  affiliation: varchar('affiliation', { length: 255 }), // Institution/company
  disciplines: text('disciplines'), // JSON array of strings, max 5
  links: text('links'), // JSON array of {title, url}, max 3
  publicationVenues: text('publication_venues'), // JSON array of strings, max 5
  favoriteOwnPapers: text('favorite_own_papers'), // JSON array of {title, url, authors, year}, max 3
  favoriteReadPapers: text('favorite_read_papers'), // JSON array of {title, url, authors, year}, max 3
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User bookmark collections
export const userBookmarkCollections = pgTable(
  'user_bookmark_collections',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    userDid: varchar('user_did', { length: 255 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 20 }).notNull(), // e.g., 'rose', 'emerald'
    position: integer('position').notNull().default(0), // For ordering
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_bookmark_collections_user_idx').on(table.userDid),
  ]
);

// User pinned feeds (for syncing across devices)
export const userFeeds = pgTable(
  'user_feeds',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    userDid: varchar('user_did', { length: 255 }).notNull(),
    feedUri: varchar('feed_uri', { length: 500 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    acceptsInteractions: boolean('accepts_interactions').default(false),
    feedType: varchar('feed_type', { length: 20 }), // 'feed' | 'keyword' | 'list' | 'verified'
    keyword: varchar('keyword', { length: 255 }),
    position: integer('position').notNull().default(0), // For ordering
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_feeds_user_idx').on(table.userDid),
  ]
);

// User bookmarks
export const userBookmarks = pgTable(
  'user_bookmarks',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    userDid: varchar('user_did', { length: 255 }).notNull(),
    postUri: varchar('post_uri', { length: 500 }).notNull(),
    postData: text('post_data').notNull(), // JSON with post details
    collectionIds: text('collection_ids'), // JSON array of collection IDs
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_bookmarks_user_idx').on(table.userDid),
    index('user_bookmarks_post_idx').on(table.postUri),
  ]
);

// Papers discovered from the firehose
export const discoveredPapers = pgTable(
  'discovered_papers',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    url: text('url').notNull(),
    normalizedId: varchar('normalized_id', { length: 255 }).notNull().unique(), // e.g., arxiv:2401.12345, doi:10.1234/foo
    source: varchar('source', { length: 50 }).notNull(), // arxiv, doi, biorxiv, medrxiv, etc.
    title: text('title'), // Fetched from API if available
    authors: text('authors'), // JSON array
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    mentionCount: integer('mention_count').default(1).notNull(),
  },
  (table) => [
    index('discovered_papers_source_idx').on(table.source),
    index('discovered_papers_last_seen_idx').on(table.lastSeenAt),
    index('discovered_papers_mention_count_idx').on(table.mentionCount),
  ]
);

// Posts that mention papers
export const paperMentions = pgTable(
  'paper_mentions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    paperId: integer('paper_id').notNull(),
    postUri: varchar('post_uri', { length: 500 }).notNull(),
    authorDid: varchar('author_did', { length: 255 }).notNull(),
    authorHandle: varchar('author_handle', { length: 255 }),
    postText: text('post_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    isVerifiedResearcher: boolean('is_verified_researcher').default(false),
  },
  (table) => [
    index('paper_mentions_paper_idx').on(table.paperId),
    index('paper_mentions_author_idx').on(table.authorDid),
    index('paper_mentions_created_idx').on(table.createdAt),
    index('paper_mentions_verified_idx').on(table.isVerifiedResearcher),
    index('paper_mentions_post_uri_idx').on(table.postUri),
  ]
);

// Substack posts discovered from the firehose
export const discoveredSubstackPosts = pgTable(
  'discovered_substack_posts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    url: text('url').notNull(),
    normalizedId: varchar('normalized_id', { length: 255 }).notNull().unique(), // e.g., substack:eugenewei/status-as-a-service
    subdomain: varchar('subdomain', { length: 100 }).notNull(), // e.g., eugenewei
    slug: varchar('slug', { length: 255 }).notNull(), // e.g., status-as-a-service
    title: text('title'), // Fetched from Open Graph
    description: text('description'), // og:description
    author: varchar('author', { length: 255 }), // Newsletter author name
    newsletterName: varchar('newsletter_name', { length: 255 }), // og:site_name
    imageUrl: text('image_url'), // og:image
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    mentionCount: integer('mention_count').default(1).notNull(),
  },
  (table) => [
    index('discovered_substack_posts_subdomain_idx').on(table.subdomain),
    index('discovered_substack_posts_last_seen_idx').on(table.lastSeenAt),
    index('discovered_substack_posts_mention_count_idx').on(table.mentionCount),
  ]
);

// Posts that mention Substack articles
export const substackMentions = pgTable(
  'substack_mentions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    substackPostId: integer('substack_post_id').notNull(),
    postUri: varchar('post_uri', { length: 500 }).notNull(),
    authorDid: varchar('author_did', { length: 255 }).notNull(),
    authorHandle: varchar('author_handle', { length: 255 }),
    postText: text('post_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    isVerifiedResearcher: boolean('is_verified_researcher').default(false),
  },
  (table) => [
    index('substack_mentions_post_idx').on(table.substackPostId),
    index('substack_mentions_author_idx').on(table.authorDid),
    index('substack_mentions_created_idx').on(table.createdAt),
    index('substack_mentions_verified_idx').on(table.isVerifiedResearcher),
    index('substack_mentions_post_uri_idx').on(table.postUri),
  ]
);

// Science/tech journalism articles (Quanta, MIT Tech Review, etc.)
export const discoveredArticles = pgTable(
  'discovered_articles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    url: text('url').notNull(),
    normalizedId: varchar('normalized_id', { length: 255 }).notNull().unique(), // e.g., quanta:12345, mittechreview:12345
    source: varchar('source', { length: 50 }).notNull(), // quanta, mittechreview
    slug: varchar('slug', { length: 500 }), // URL slug/path
    title: text('title'),
    description: text('description'),
    author: varchar('author', { length: 255 }),
    imageUrl: text('image_url'),
    category: varchar('category', { length: 100 }), // e.g., "Computer Science", "AI"
    publishedAt: timestamp('published_at'), // Original publication date
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    mentionCount: integer('mention_count').default(1).notNull(),
  },
  (table) => [
    index('discovered_articles_source_idx').on(table.source),
    index('discovered_articles_last_seen_idx').on(table.lastSeenAt),
    index('discovered_articles_mention_count_idx').on(table.mentionCount),
  ]
);

// Posts that mention science/tech journalism articles
export const articleMentions = pgTable(
  'article_mentions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    articleId: integer('article_id').notNull(),
    postUri: varchar('post_uri', { length: 500 }).notNull(),
    authorDid: varchar('author_did', { length: 255 }).notNull(),
    postText: text('post_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    isVerifiedResearcher: boolean('is_verified_researcher').default(false),
  },
  (table) => [
    index('article_mentions_article_idx').on(table.articleId),
    index('article_mentions_author_idx').on(table.authorDid),
    index('article_mentions_created_idx').on(table.createdAt),
    index('article_mentions_verified_idx').on(table.isVerifiedResearcher),
    index('article_mentions_post_uri_idx').on(table.postUri),
  ]
);

// Invite codes for closed beta access
export const inviteCodes = pgTable(
  'invite_codes',
  {
    code: varchar('code', { length: 50 }).primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 255 }), // DID of creator, if applicable
    maxUses: integer('max_uses').default(1).notNull(), // How many times this code can be used
    usedCount: integer('used_count').default(0).notNull(), // How many times it has been used
    expiresAt: timestamp('expires_at'), // Optional expiration
    note: text('note'), // Internal note about who this code is for
  }
);

// Users authorized to access the app (have successfully logged in with a valid invite)
export const authorizedUsers = pgTable(
  'authorized_users',
  {
    did: varchar('did', { length: 255 }).primaryKey(),
    handle: varchar('handle', { length: 255 }),
    authorizedAt: timestamp('authorized_at').defaultNow().notNull(),
    inviteCodeUsed: varchar('invite_code_used', { length: 50 }), // Which invite code they used
  },
  (table) => [
    index('authorized_users_handle_idx').on(table.handle),
  ]
);

// Type exports
export type VerifiedResearcher = typeof verifiedResearchers.$inferSelect;
export type NewVerifiedResearcher = typeof verifiedResearchers.$inferInsert;
export type SocialGraphEdge = typeof socialGraph.$inferSelect;
export type VouchRequest = typeof vouchRequests.$inferSelect;
export type BlueskyList = typeof blueskyLists.$inferSelect;
export type ResearcherProfile = typeof researcherProfiles.$inferSelect;
export type NewResearcherProfile = typeof researcherProfiles.$inferInsert;
export type UserBookmarkCollection = typeof userBookmarkCollections.$inferSelect;
export type UserBookmark = typeof userBookmarks.$inferSelect;
export type UserFeed = typeof userFeeds.$inferSelect;
export type DiscoveredPaper = typeof discoveredPapers.$inferSelect;
export type NewDiscoveredPaper = typeof discoveredPapers.$inferInsert;
export type PaperMention = typeof paperMentions.$inferSelect;
export type NewPaperMention = typeof paperMentions.$inferInsert;
export type DiscoveredSubstackPost = typeof discoveredSubstackPosts.$inferSelect;
export type NewDiscoveredSubstackPost = typeof discoveredSubstackPosts.$inferInsert;
export type SubstackMention = typeof substackMentions.$inferSelect;
export type NewSubstackMention = typeof substackMentions.$inferInsert;
export type DiscoveredArticle = typeof discoveredArticles.$inferSelect;
export type NewDiscoveredArticle = typeof discoveredArticles.$inferInsert;
export type ArticleMention = typeof articleMentions.$inferSelect;
export type NewArticleMention = typeof articleMentions.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type AuthorizedUser = typeof authorizedUsers.$inferSelect;
export type NewAuthorizedUser = typeof authorizedUsers.$inferInsert;

// Polls attached to posts
export const polls = pgTable(
  'polls',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    postUri: varchar('post_uri', { length: 500 }).notNull().unique(), // The Bluesky post this poll is attached to
    creatorDid: varchar('creator_did', { length: 255 }).notNull(),
    question: text('question'), // Optional question text (post text can serve as question)
    options: text('options').notNull(), // JSON array of {id: string, text: string}
    endsAt: timestamp('ends_at'), // Optional expiration time
    allowMultiple: boolean('allow_multiple').default(false), // Allow multiple selections
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('polls_post_uri_idx').on(table.postUri),
    index('polls_creator_idx').on(table.creatorDid),
  ]
);

// Poll votes - anonymous, no voter info stored
export const pollVotes = pgTable(
  'poll_votes',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    pollId: varchar('poll_id', { length: 50 }).notNull(),
    optionId: varchar('option_id', { length: 50 }).notNull(), // Which option was selected
    votedAt: timestamp('voted_at').defaultNow().notNull(),
  },
  (table) => [
    index('poll_votes_poll_idx').on(table.pollId),
  ]
);

// Poll participants - tracks who has voted (hashed, can't see what they voted for)
export const pollParticipants = pgTable(
  'poll_participants',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    pollId: varchar('poll_id', { length: 50 }).notNull(),
    voterHash: varchar('voter_hash', { length: 64 }).notNull(), // SHA-256 hash of pollId:voterDid
    votedAt: timestamp('voted_at').defaultNow().notNull(),
  },
  (table) => [
    index('poll_participants_poll_idx').on(table.pollId),
    index('poll_participants_hash_idx').on(table.voterHash),
  ]
);

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;
export type PollParticipant = typeof pollParticipants.$inferSelect;
export type NewPollParticipant = typeof pollParticipants.$inferInsert;

export interface PollOption {
  id: string;
  text: string;
}

// Profile field types
export interface ProfileLink {
  title: string;
  url: string;
}

export interface ProfilePaper {
  title: string;
  url: string;
  authors: string;
  year: number | string;
  venue?: string;
}
