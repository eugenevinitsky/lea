import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyUserAccess } from '@/lib/server-auth';

// PUT /api/profile/ids - Update researcher IDs (ORCID, OpenAlex)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, orcid, openAlexId } = body;

    if (!did) {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Verify the user is authenticated and updating their own profile
    const auth = await verifyUserAccess(request, did);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Verify this is a verified researcher
    const [researcher] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, did))
      .limit(1);

    if (!researcher || !researcher.isActive) {
      return NextResponse.json({ error: 'Only verified researchers can update their IDs' }, { status: 403 });
    }

    // Validate ORCID format (0000-0000-0000-0000 or 0000-0000-0000-000X)
    if (orcid !== undefined && orcid !== null && orcid !== '') {
      const orcidRegex = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
      if (!orcidRegex.test(orcid)) {
        return NextResponse.json({ error: 'Invalid ORCID format. Expected: 0000-0000-0000-0000' }, { status: 400 });
      }
    }

    // Validate OpenAlex ID format (starts with A followed by digits, or full URL)
    let normalizedOpenAlexId = openAlexId;
    if (openAlexId !== undefined && openAlexId !== null && openAlexId !== '') {
      // Extract ID from URL if provided as full URL
      const urlMatch = openAlexId.match(/openalex\.org\/authors?\/(A\d+)/i);
      if (urlMatch) {
        normalizedOpenAlexId = urlMatch[1];
      } else if (/^A\d+$/i.test(openAlexId)) {
        normalizedOpenAlexId = openAlexId.toUpperCase();
      } else if (/^\d+$/.test(openAlexId)) {
        normalizedOpenAlexId = 'A' + openAlexId;
      } else {
        return NextResponse.json({ error: 'Invalid OpenAlex ID format. Expected: A1234567890 or full URL' }, { status: 400 });
      }
    }

    // Build update object
    const updateData: { orcid?: string; openAlexId?: string | null } = {};
    
    if (orcid !== undefined) {
      updateData.orcid = orcid;
    }
    
    if (openAlexId !== undefined) {
      updateData.openAlexId = normalizedOpenAlexId || null;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await db
      .update(verifiedResearchers)
      .set(updateData)
      .where(eq(verifiedResearchers.did, did));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update researcher IDs:', error);
    return NextResponse.json({ error: 'Failed to update researcher IDs' }, { status: 500 });
  }
}
