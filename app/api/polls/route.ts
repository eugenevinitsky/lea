import { NextRequest, NextResponse } from 'next/server';
import { db, polls, pollVotes } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

interface PollOption {
  id: string;
  text: string;
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

    // Fetch all votes for this poll
    const votes = await db
      .select()
      .from(pollVotes)
      .where(eq(pollVotes.pollId, poll.id));

    // Calculate vote counts per option
    const options: PollOption[] = JSON.parse(poll.options);
    const voteCounts: Record<string, number> = {};
    options.forEach(opt => { voteCounts[opt.id] = 0; });
    votes.forEach(vote => {
      if (voteCounts[vote.optionId] !== undefined) {
        voteCounts[vote.optionId]++;
      }
    });

    // Check if current user has voted
    let userVotes: string[] = [];
    if (voterDid) {
      userVotes = votes
        .filter(v => v.voterDid === voterDid)
        .map(v => v.optionId);
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
      userVotes,
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

        const id = `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const formattedOptions: PollOption[] = options.map((text: string, i: number) => ({
          id: `opt_${i}_${Math.random().toString(36).substr(2, 6)}`,
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
        const { pollId, voterDid, optionId } = data;

        if (!pollId || !voterDid || !optionId) {
          return NextResponse.json(
            { error: 'pollId, voterDid, and optionId required' },
            { status: 400 }
          );
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

        // Validate option exists
        const options: PollOption[] = JSON.parse(poll.options);
        if (!options.some(opt => opt.id === optionId)) {
          return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
        }

        // Check existing votes by this user
        const existingVotes = await db
          .select()
          .from(pollVotes)
          .where(and(
            eq(pollVotes.pollId, pollId),
            eq(pollVotes.voterDid, voterDid)
          ));

        // If not allowing multiple votes and user already voted, remove old vote
        if (!poll.allowMultiple && existingVotes.length > 0) {
          await db
            .delete(pollVotes)
            .where(and(
              eq(pollVotes.pollId, pollId),
              eq(pollVotes.voterDid, voterDid)
            ));
        }

        // Check if already voted for this specific option
        if (existingVotes.some(v => v.optionId === optionId)) {
          return NextResponse.json({ error: 'Already voted for this option' }, { status: 400 });
        }

        // Add vote
        const voteId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(pollVotes).values({
          id: voteId,
          pollId,
          voterDid,
          optionId,
        });

        return NextResponse.json({ success: true });
      }

      case 'unvote': {
        const { pollId, voterDid, optionId } = data;

        if (!pollId || !voterDid) {
          return NextResponse.json(
            { error: 'pollId and voterDid required' },
            { status: 400 }
          );
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

        // Remove vote(s)
        if (optionId) {
          // Remove specific vote
          await db
            .delete(pollVotes)
            .where(and(
              eq(pollVotes.pollId, pollId),
              eq(pollVotes.voterDid, voterDid),
              eq(pollVotes.optionId, optionId)
            ));
        } else {
          // Remove all votes by this user on this poll
          await db
            .delete(pollVotes)
            .where(and(
              eq(pollVotes.pollId, pollId),
              eq(pollVotes.voterDid, voterDid)
            ));
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
