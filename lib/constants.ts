// Shared constants used across client and server code

// LEA labeler DID
export const LEA_LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Verified researchers list URI (owned by labeler)
export const VERIFIED_RESEARCHERS_LIST = `at://${LEA_LABELER_DID}/app.bsky.graph.list/3masawnn3xj23`;

// ==================== OCN (Open Community Notes) Constants ====================

// Maximum length for community note text
export const MAX_COMMUNITY_NOTE_LENGTH = 2000;

// ATProto label values for community notes
export const LABEL_ANNOTATION = 'annotation';
export const LABEL_PROPOSED_ANNOTATION = 'proposed-annotation';

// OCN proposal reasons (why a note is being written)
export const OCN_PROPOSAL_REASONS = [
  'factual_error',
  'altered_media',
  'outdated_information',
  'misrepresentation_or_missing_context',
  'unverified_claim_as_fact',
  'joke_or_satire',
  'other',
] as const;
export type OcnProposalReason = typeof OCN_PROPOSAL_REASONS[number];

// Human-readable labels for proposal reasons
export const OCN_PROPOSAL_REASON_LABELS: Record<OcnProposalReason, string> = {
  factual_error: 'Factual Error',
  altered_media: 'Altered Media',
  outdated_information: 'Outdated Information',
  misrepresentation_or_missing_context: 'Misrepresentation or Missing Context',
  unverified_claim_as_fact: 'Unverified Claim as Fact',
  joke_or_satire: 'Joke or Satire',
  other: 'Other',
};

// OCN vote reasons for helpful votes
export const OCN_VOTE_HELPFUL_REASONS = [
  'informative',
  'clear_and_well_written',
  'provides_important_context',
  'addresses_the_claims',
  'good_sources',
  'unique_context',
] as const;
export type OcnVoteHelpfulReason = typeof OCN_VOTE_HELPFUL_REASONS[number];

// OCN vote reasons for not helpful votes
export const OCN_VOTE_NOT_HELPFUL_REASONS = [
  'incorrect',
  'biased_or_one_sided',
  'sources_not_included_or_unreliable',
  'opinion_speculation_not_fact',
  'outdated',
  'off_topic',
  'missing_key_points',
  'argumentative_or_inflammatory',
  'note_is_spam_or_harassment',
  'hard_to_understand',
] as const;
export type OcnVoteNotHelpfulReason = typeof OCN_VOTE_NOT_HELPFUL_REASONS[number];

// Human-readable labels for vote reasons
export const OCN_VOTE_REASON_LABELS: Record<string, string> = {
  informative: 'Informative',
  clear_and_well_written: 'Clear & Well-Written',
  provides_important_context: 'Provides Important Context',
  addresses_the_claims: 'Addresses the Claims',
  good_sources: 'Good Sources',
  unique_context: 'Unique Context',
  incorrect: 'Incorrect',
  biased_or_one_sided: 'Biased or One-Sided',
  sources_not_included_or_unreliable: 'Sources Not Included or Unreliable',
  opinion_speculation_not_fact: 'Opinion/Speculation, Not Fact',
  outdated: 'Outdated',
  off_topic: 'Off Topic',
  missing_key_points: 'Missing Key Points',
  argumentative_or_inflammatory: 'Argumentative or Inflammatory',
  note_is_spam_or_harassment: 'Spam or Harassment',
  hard_to_understand: 'Hard to Understand',
};

// Map OCN proposal reasons to legacy classification values
export const LEGACY_CLASSIFICATION_MAP: Record<OcnProposalReason, string> = {
  factual_error: 'misinformed_or_misleading',
  altered_media: 'misinformed_or_misleading',
  outdated_information: 'missing_context',
  misrepresentation_or_missing_context: 'missing_context',
  unverified_claim_as_fact: 'misinformed_or_misleading',
  joke_or_satire: 'needs_nuance',
  other: 'other',
};

// Map legacy classification to OCN reasons (for backfill)
export const CLASSIFICATION_TO_OCN_REASONS: Record<string, OcnProposalReason> = {
  misinformed_or_misleading: 'factual_error',
  missing_context: 'misrepresentation_or_missing_context',
  needs_nuance: 'misrepresentation_or_missing_context',
  other: 'other',
};
