import { NextRequest, NextResponse } from 'next/server';
import { db, researcherProfiles, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';

// GET /api/profile?did=xxx - Fetch a researcher's profile
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  try {
    // Get verified researcher info
    const [researcher] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, did))
      .limit(1);

    if (!researcher || !researcher.isActive) {
      return NextResponse.json({ error: 'Researcher not found' }, { status: 404 });
    }

    // Get profile data (may not exist yet)
    const [profile] = await db
      .select()
      .from(researcherProfiles)
      .where(eq(researcherProfiles.did, did))
      .limit(1);

    // Parse JSON fields
    const profileData = profile ? {
      shortBio: profile.shortBio,
      affiliation: profile.affiliation,
      disciplines: profile.disciplines ? JSON.parse(profile.disciplines) : [],
      links: profile.links ? JSON.parse(profile.links) : [],
      publicationVenues: profile.publicationVenues ? JSON.parse(profile.publicationVenues) : [],
      favoriteOwnPapers: profile.favoriteOwnPapers ? JSON.parse(profile.favoriteOwnPapers) : [],
      favoriteReadPapers: profile.favoriteReadPapers ? JSON.parse(profile.favoriteReadPapers) : [],
      updatedAt: profile.updatedAt,
    } : null;

    return NextResponse.json({
      researcher: {
        did: researcher.did,
        handle: researcher.handle,
        name: researcher.name,
        orcid: researcher.orcid,
        openAlexId: researcher.openAlexId,
        institution: researcher.institution,
        researchTopics: researcher.researchTopics ? JSON.parse(researcher.researchTopics) : [],
        verifiedAt: researcher.verifiedAt,
      },
      profile: profileData,
    });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PUT /api/profile - Update own profile
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, shortBio, affiliation, disciplines, links, publicationVenues, favoriteOwnPapers, favoriteReadPapers } = body;

    if (!did) {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Verify this is a verified researcher
    const [researcher] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, did))
      .limit(1);

    if (!researcher || !researcher.isActive) {
      return NextResponse.json({ error: 'Only verified researchers can update profiles' }, { status: 403 });
    }

    // Validate field lengths
    if (shortBio && shortBio.length > 500) {
      return NextResponse.json({ error: 'Bio too long (max 500 chars)' }, { status: 400 });
    }
    if (disciplines && disciplines.length > 5) {
      return NextResponse.json({ error: 'Max 5 disciplines' }, { status: 400 });
    }
    if (links && links.length > 3) {
      return NextResponse.json({ error: 'Max 3 links' }, { status: 400 });
    }
    if (publicationVenues && publicationVenues.length > 5) {
      return NextResponse.json({ error: 'Max 5 publication venues' }, { status: 400 });
    }
    if (favoriteOwnPapers && favoriteOwnPapers.length > 3) {
      return NextResponse.json({ error: 'Max 3 favorite own papers' }, { status: 400 });
    }
    if (favoriteReadPapers && favoriteReadPapers.length > 3) {
      return NextResponse.json({ error: 'Max 3 favorite read papers' }, { status: 400 });
    }

    // Validate link structure
    if (links) {
      for (const link of links as ProfileLink[]) {
        if (!link.title || !link.url) {
          return NextResponse.json({ error: 'Links must have title and url' }, { status: 400 });
        }
      }
    }

    // Validate paper structure
    const validatePapers = (papers: ProfilePaper[] | undefined, fieldName: string) => {
      if (!papers) return;
      for (const paper of papers) {
        if (!paper.title || !paper.url) {
          return NextResponse.json({ error: `${fieldName} must have title and url` }, { status: 400 });
        }
      }
    };
    validatePapers(favoriteOwnPapers, 'Favorite own papers');
    validatePapers(favoriteReadPapers, 'Favorite read papers');

    // Check if profile exists
    const [existing] = await db
      .select()
      .from(researcherProfiles)
      .where(eq(researcherProfiles.did, did))
      .limit(1);

    const profileData = {
      shortBio: shortBio || null,
      affiliation: affiliation || null,
      disciplines: disciplines ? JSON.stringify(disciplines) : null,
      links: links ? JSON.stringify(links) : null,
      publicationVenues: publicationVenues ? JSON.stringify(publicationVenues) : null,
      favoriteOwnPapers: favoriteOwnPapers ? JSON.stringify(favoriteOwnPapers) : null,
      favoriteReadPapers: favoriteReadPapers ? JSON.stringify(favoriteReadPapers) : null,
      updatedAt: new Date(),
    };

    if (existing) {
      // Update existing profile
      await db
        .update(researcherProfiles)
        .set(profileData)
        .where(eq(researcherProfiles.did, did));
    } else {
      // Create new profile
      await db.insert(researcherProfiles).values({
        did,
        ...profileData,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
