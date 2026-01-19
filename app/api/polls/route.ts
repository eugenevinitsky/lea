import { NextRequest, NextResponse } from 'next/server';
import { db, polls, pollVotes, pollParticipants } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { getAuthenticatedDid } from '@/lib/server-auth';

interface PollOption {
  id: string;
  text: string;
}

// Safe JSON parse that returns default value on error
function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// Generate cryptographically secure random ID
function secureRandomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

// Hash voter DID with poll ID for anonymous participation tracking
// This prevents seeing who voted for what, but still prevents double voting
function hashVoter(pollId: string, voterDid: string): string {
  return createHash('sha256').update(`${pollId}:${voterDid}`).digest('hex');
}

// GET /api/polls?postUri=xxx - Fetch poll data by post URI
export async function GET(request: NextRequest) {
  const postUri = request.nextUrl.searchParams.get('postUri');
  const voterDid = request.nextUrl.searchParams.get('voterDid');

  if (!postUri) {
    return NextResponse.json({ error: 'postUri required' }, { status: 400 });
  }

  try {
    // Fetch poll
    let poll;
    try {
      [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.postUri, postUri))
        .limit(1);
    } catch (dbError: unknown) {
      // Table might not exist yet
      if ((dbError as { code?: string })?.code === '42P01') {
        return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
      }
      throw dbError;
    }

    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
    }

    // Fetch all votes for this poll (anonymous - no voter info)
    const votes = await db
      .select()
      .from(pollVotes)
      .where(eq(pollVotes.pollId, poll.id));

    // Calculate vote counts per option (use safe parse to handle corrupted data)
    const options: PollOption[] = safeJsonParse<PollOption[]>(poll.options, []);
    if (options.length === 0) {
      return NextResponse.json({ error: 'Poll has invalid options' }, { status: 500 });
    }
    const voteCounts: Record<string, number> = {};
    options.forEach(opt => { voteCounts[opt.id] = 0; });
    votes.forEach(vote => {
      if (voteCounts[vote.optionId] !== undefined) {
        voteCounts[vote.optionId]++;
      }
    });

    // Check if current user has voted (using participation table)
    let hasVoted = false;
    if (voterDid) {
      const voterHash = hashVoter(poll.id, voterDid);
      const [participant] = await db
        .select()
        .from(pollParticipants)
        .where(and(
          eq(pollParticipants.pollId, poll.id),
          eq(pollParticipants.voterHash, voterHash)
        ))
        .limit(1);
      hasVoted = !!participant;
    }

    const totalVotes = votes.length;
    const isExpired = poll.endsAt ? new Date(poll.endsAt) < new Date() : false;

    return NextResponse.json({
      id: poll.id,
      postUri: poll.postUri,
      creatorDid: poll.creatorDid,
      question: poll.question,
      options: options.map(opt => ({
        id: opt.id,
        text: opt.text,
        votes: voteCounts[opt.id] || 0,
        percentage: totalVotes > 0 ? Math.round((voteCounts[opt.id] / totalVotes) * 100) : 0,
      })),
      allowMultiple: poll.allowMultiple,
      endsAt: poll.endsAt,
      isExpired,
      totalVotes,
      hasVoted, // Changed from userVotes array to simple boolean
      createdAt: poll.createdAt,
    });
  } catch (error) {
    console.error('Failed to fetch poll:', error);
    return NextResponse.json({ error: 'Failed to fetch poll' }, { status: 500 });
  }
}

// POST /api/polls - Create poll or vote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'create': {
        const { postUri, creatorDid, question, options, endsAt, allowMultiple } = data;

        if (!postUri || !creatorDid || !options || !Array.isArray(options) || options.length < 2) {
          return NextResponse.json(
            { error: 'postUri, creatorDid, and at least 2 options required' },
            { status: 400 }
          );
        }

        // Verify the user is authenticated and creating a poll as themselves
        const authenticatedDid = getAuthenticatedDid(request);
        if (!authenticatedDid) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        if (authenticatedDid !== creatorDid) {
          return NextResponse.json({ error: 'Cannot create polls for other users' }, { status: 403 });
        }

        if (options.length > 4) {
          return NextResponse.json(
            { error: 'Maximum 4 options allowed' },
            { status: 400 }
          );
        }

        // Check if poll already exists for this post
        const [existing] = await db
          .select()
          .from(polls)
          .where(eq(polls.postUri, postUri))
          .limit(1);

        if (existing) {
          return NextResponse.json(
            { error: 'Poll already exists for this post' },
            { status: 409 }
          );
        }

        const id = `poll_${Date.now()}_${randomBytes(6).toString('hex')}`;
        const formattedOptions: PollOption[] = options.map((text: string, i: number) => ({
          id: `opt_${i}_${randomBytes(4).toString('hex')}`,
          text: text.trim(),
        }));

        await db.insert(polls).values({
          id,
          postUri,
          creatorDid,
          question: question?.trim() || null,
          options: JSON.stringify(formattedOptions),
          endsAt: endsAt ? new Date(endsAt) : null,
          allowMultiple: allowMultiple || false,
        });

        return NextResponse.json({ success: true, id, options: formattedOptions });
      }

      case 'vote': {
        const { pollId, voterDid, optionIds } = data;

        if (!pollId || !voterDid || !optionIds || !Array.isArray(optionIds) || optionIds.length === 0) {
          return NextResponse.json(
            { error: 'pollId, voterDid, and optionIds required' },
            { status: 400 }
          );
        }

        // Verify the user is authenticated and voting as themselves
        const authenticatedDid = getAuthenticatedDid(request);
        if (!authenticatedDid) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        if (authenticatedDid !== voterDid) {
          return NextResponse.json({ error: 'Cannot vote as another user' }, { status: 403 });
        }

        // Fetch poll to check if it exists and isn't expired
        const [poll] = await db
          .select()
          .from(polls)
          .where(eq(polls.id, pollId))
          .limit(1);

        if (!poll) {
          return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
        }

        if (poll.endsAt && new Date(poll.endsAt) < new Date()) {
          return NextResponse.json({ error: 'Poll has ended' }, { status: 400 });
        }

        // Validate options exist (use safe parse to handle corrupted data)
        const options: PollOption[] = safeJsonParse<PollOption[]>(poll.options, []);
        if (options.length === 0) {
          return NextResponse.json({ error: 'Poll has invalid options' }, { status: 500 });
        }
        const validOptionIds = options.map(opt => opt.id);
        for (const optionId of optionIds) {
          if (!validOptionIds.includes(optionId)) {
            return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
          }
        }

        // Check if multiple options allowed
        if (!poll.allowMultiple && optionIds.length > 1) {
          return NextResponse.json({ error: 'Multiple selections not allowed' }, { status: 400 });
        }

        // Hash the voter DID for anonymous participation tracking
        const voterHash = hashVoter(pollId, voterDid);

        // Check if user has already voted
        const [existingParticipant] = await db
          .select()
          .from(pollParticipants)
          .where(and(
            eq(pollParticipants.pollId, pollId),
            eq(pollParticipants.voterHash, voterHash)
          ))
          .limit(1);

        if (existingParticipant) {
          return NextResponse.json({ error: 'Already voted' }, { status: 400 });
        }

        // Record participation (hashed - can't see what they voted for)
        const participantId = `part_${Date.now()}_${randomBytes(6).toString('hex')}`;
        await db.insert(pollParticipants).values({
          id: participantId,
          pollId,
          voterHash,
        });

        // Record anonymous votes (no voter info - can't see who voted)
        for (const optionId of optionIds) {
          const voteId = `vote_${Date.now()}_${randomBytes(6).toString('hex')}`;
          await db.insert(pollVotes).values({
            id: voteId,
            pollId,
            optionId,
          });
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to process poll action:', error);
    return NextResponse.json({ error: 'Failed to process poll action' }, { status: 500 });
  }
}
