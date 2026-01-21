import { NextRequest, NextResponse } from 'next/server';
import { db, inviteCodes } from '@/lib/db';
import { desc } from 'drizzle-orm';
import crypto from 'crypto';

// Timing-safe secret comparison
function verifyBearerSecret(authHeader: string | null, expected: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Generate a random invite code (8 chars, uppercase alphanumeric)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars: 0, O, I, 1
  let code = '';
  const randomBytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

// GET /api/admin/invite-codes - List all invite codes
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret) {
    console.error('PAPER_FIREHOSE_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const codes = await db
      .select()
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt));

    return NextResponse.json({
      codes: codes.map((code) => ({
        code: code.code,
        createdAt: code.createdAt,
        createdBy: code.createdBy,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        remaining: code.maxUses - code.usedCount,
        expiresAt: code.expiresAt,
        expired: code.expiresAt ? new Date() > code.expiresAt : false,
        note: code.note,
      })),
    });
  } catch (error) {
    console.error('Failed to list invite codes:', error);
    return NextResponse.json({ error: 'Failed to list invite codes' }, { status: 500 });
  }
}

// POST /api/admin/invite-codes - Create new invite code(s)
// Body: { count?: number, maxUses?: number, expiresInDays?: number, note?: string }
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret) {
    console.error('PAPER_FIREHOSE_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.min(Math.max(body.count || 1, 1), 100); // 1-100 codes
    const maxUses = Math.max(body.maxUses || 1, 1);
    const expiresInDays = body.expiresInDays;
    const note = body.note || null;

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const newCodes: string[] = [];
    const existingCodes = new Set(
      (await db.select({ code: inviteCodes.code }).from(inviteCodes)).map((c) => c.code)
    );

    // Generate unique codes
    for (let i = 0; i < count; i++) {
      let code: string;
      let attempts = 0;
      do {
        code = generateInviteCode();
        attempts++;
      } while (existingCodes.has(code) && attempts < 100);

      if (attempts >= 100) {
        return NextResponse.json(
          { error: 'Failed to generate unique codes' },
          { status: 500 }
        );
      }

      existingCodes.add(code);
      newCodes.push(code);
    }

    // Insert all codes
    await db.insert(inviteCodes).values(
      newCodes.map((code) => ({
        code,
        maxUses,
        expiresAt,
        note,
      }))
    );

    return NextResponse.json({
      success: true,
      codes: newCodes,
      count: newCodes.length,
      maxUses,
      expiresAt,
      note,
    });
  } catch (error) {
    console.error('Failed to create invite codes:', error);
    return NextResponse.json({ error: 'Failed to create invite codes' }, { status: 500 });
  }
}
