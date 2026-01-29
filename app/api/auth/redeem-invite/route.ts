import { NextRequest, NextResponse } from 'next/server';
import { db, inviteCodes, authorizedUsers } from '@/lib/db';
import { eq, and, gt, or, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// POST /api/auth/redeem-invite - Redeem an invite code for a user
// Body: { code: string, did: string, handle?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, did, handle } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
    }

    if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
      return NextResponse.json({ error: 'Valid DID required' }, { status: 400 });
    }

    // Normalize code (trim whitespace, uppercase for consistency)
    const normalizedCode = code.trim().toUpperCase();

    // Check if user is already authorized
    const [existingUser] = await db
      .select()
      .from(authorizedUsers)
      .where(eq(authorizedUsers.did, did))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: 'User is already authorized',
        alreadyAuthorized: true,
      });
    }

    // Redeem the code: validate, insert authorized user, and increment used count
    // Use a transaction to ensure atomicity and prevent race conditions
    let redemptionSuccess = false;

    try {
      await db.transaction(async (tx) => {
        // Find and validate the invite code INSIDE the transaction
        const [inviteCode] = await tx
          .select()
          .from(inviteCodes)
          .where(
            and(
              eq(inviteCodes.code, normalizedCode),
              // Check code hasn't exceeded max uses
              gt(inviteCodes.maxUses, sql`${inviteCodes.usedCount}`),
              // Check code hasn't expired (null expiresAt means no expiration)
              or(
                isNull(inviteCodes.expiresAt),
                gt(inviteCodes.expiresAt, new Date())
              )
            )
          )
          .limit(1);

        if (!inviteCode) {
          throw new Error('INVALID_CODE');
        }

        // Insert the authorized user
        await tx.insert(authorizedUsers).values({
          did,
          handle: handle || null,
          inviteCodeUsed: normalizedCode,
        });

        // Increment the used count
        await tx
          .update(inviteCodes)
          .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
          .where(eq(inviteCodes.code, normalizedCode));

        redemptionSuccess = true;
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'INVALID_CODE') {
        return NextResponse.json(
          { error: 'Invalid or expired invite code' },
          { status: 400 }
        );
      }
      throw txError;
    }

    return NextResponse.json({
      success: true,
      message: 'Invite code redeemed successfully',
    });
  } catch (error) {
    console.error('Failed to redeem invite code:', error);
    
    // Check for unique constraint violation (user already exists)
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json({
        success: true,
        message: 'User is already authorized',
        alreadyAuthorized: true,
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to redeem invite code' },
      { status: 500 }
    );
  }
}
