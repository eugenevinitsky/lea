import { BskyAgent } from '@atproto/api';
import { db, communityNotes, communityNoteLabelLog } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import {
  LEA_LABELER_DID,
  LABEL_ANNOTATION,
  LABEL_PROPOSED_ANNOTATION,
} from '@/lib/constants';

function secureRandomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

async function getLabelerAgent(): Promise<BskyAgent | null> {
  const handle = process.env.LEA_LABELER_HANDLE;
  const password = process.env.LEA_LABELER_PASSWORD;

  if (!handle || !password) {
    return null;
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  return agent;
}

function getOzoneUrl(): string {
  const url = process.env.OZONE_URL;
  if (!url) {
    throw new Error('OZONE_URL environment variable is required');
  }
  return url;
}

type NoteStatus = 'CRH' | 'CRNH' | 'NMR';

/**
 * Map a note's scoring status to the appropriate label value.
 * CRH → annotation (proven helpful)
 * NMR → proposed-annotation (needs more ratings)
 * CRNH → null (should be negated, not published)
 */
function statusToLabelVal(status: NoteStatus): string | null {
  switch (status) {
    case 'CRH':
      return LABEL_ANNOTATION;
    case 'NMR':
      return LABEL_PROPOSED_ANNOTATION;
    case 'CRNH':
      return null;
  }
}

/**
 * Publish or update a label for a community note based on its new status.
 * Returns true if the label was successfully published/updated.
 */
export async function publishNoteLabel(
  noteId: string,
  postUri: string,
  status: NoteStatus
): Promise<boolean> {
  const labelVal = statusToLabelVal(status);

  if (!labelVal) {
    // CRNH — negate instead of publish
    return negateNoteLabel(noteId, postUri);
  }

  const logId = secureRandomId('cll');

  try {
    const agent = await getLabelerAgent();
    if (!agent || !agent.session) {
      await logLabelAction(logId, noteId, 'publish', labelVal, false, 'Labeler agent not configured');
      return false;
    }

    const ozoneUrl = getOzoneUrl();

    // Create label via Ozone moderation API
    const response = await fetch(`${ozoneUrl}/xrpc/tools.ozone.moderation.emitEvent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agent.session.accessJwt}`,
      },
      body: JSON.stringify({
        event: {
          $type: 'tools.ozone.moderation.defs#modEventLabel',
          createLabelVals: [labelVal],
          negateLabelVals: [],
          comment: `Community note ${noteId} reached ${status}`,
        },
        subject: {
          $type: 'com.atproto.repo.strongRef',
          uri: postUri,
          cid: '', // CID not required for label operations
        },
        createdBy: LEA_LABELER_DID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Label publish failed for note ${noteId}:`, errorText);
      await logLabelAction(logId, noteId, 'publish', labelVal, false, errorText);
      return false;
    }

    // Update the note's label status in DB
    const now = new Date();
    await db
      .update(communityNotes)
      .set({
        labelStatus: labelVal,
        labelPublishedAt: now,
        labelUri: `at://${LEA_LABELER_DID}/com.atproto.label.label/${noteId}`,
      })
      .where(eq(communityNotes.id, noteId));

    await logLabelAction(logId, noteId, 'publish', labelVal, true, null);
    return true;
  } catch (error) {
    console.error(`Label publish error for note ${noteId}:`, error);
    await logLabelAction(logId, noteId, 'publish', labelVal, false, String(error));
    return false;
  }
}

/**
 * Negate any active label for a community note.
 * Called when a note is scored CRNH or deleted.
 */
export async function negateNoteLabel(
  noteId: string,
  postUri: string
): Promise<boolean> {
  const logId = secureRandomId('cll');

  try {
    // Check current label status
    const [note] = await db
      .select({ labelStatus: communityNotes.labelStatus })
      .from(communityNotes)
      .where(eq(communityNotes.id, noteId))
      .limit(1);

    if (!note || note.labelStatus === 'none' || note.labelStatus === 'negated') {
      // Nothing to negate
      return true;
    }

    const currentLabelVal = note.labelStatus; // 'annotation' or 'proposed-annotation'

    const agent = await getLabelerAgent();
    if (!agent || !agent.session) {
      await logLabelAction(logId, noteId, 'negate', currentLabelVal, false, 'Labeler agent not configured');
      return false;
    }

    const ozoneUrl = getOzoneUrl();

    const response = await fetch(`${ozoneUrl}/xrpc/tools.ozone.moderation.emitEvent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agent.session.accessJwt}`,
      },
      body: JSON.stringify({
        event: {
          $type: 'tools.ozone.moderation.defs#modEventLabel',
          createLabelVals: [],
          negateLabelVals: [currentLabelVal],
          comment: `Negating label for community note ${noteId}`,
        },
        subject: {
          $type: 'com.atproto.repo.strongRef',
          uri: postUri,
          cid: '',
        },
        createdBy: LEA_LABELER_DID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Label negation failed for note ${noteId}:`, errorText);
      await logLabelAction(logId, noteId, 'negate', currentLabelVal, false, errorText);
      return false;
    }

    // Update the note's label status
    await db
      .update(communityNotes)
      .set({ labelStatus: 'negated' })
      .where(eq(communityNotes.id, noteId));

    await logLabelAction(logId, noteId, 'negate', currentLabelVal, true, null);
    return true;
  } catch (error) {
    console.error(`Label negation error for note ${noteId}:`, error);
    await logLabelAction(logId, noteId, 'negate', null, false, String(error));
    return false;
  }
}

async function logLabelAction(
  id: string,
  noteId: string,
  action: string,
  labelVal: string | null,
  success: boolean,
  error: string | null
): Promise<void> {
  try {
    await db.insert(communityNoteLabelLog).values({
      id,
      noteId,
      action,
      labelVal,
      success,
      error,
    });
  } catch (logError) {
    console.error('Failed to log label action:', logError);
  }
}
