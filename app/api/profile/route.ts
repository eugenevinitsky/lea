import { NextRequest, NextResponse } from 'next/server';
import { db, researcherProfiles, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';
import { verifyUserAccess } from '@/lib/server-auth';

// Safe JSON parse that returns a default value on error
function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// Validate URL format and protocol
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Validate URL isn't a potential XSS vector
function isSafeUrl(url: string): boolean {
  if (!isValidUrl(url)) return false;

  const urlLower = url.toLowerCase().trim();
  // Block javascript: and data: URLs (could bypass protocol check via encoding)
  if (urlLower.startsWith('javascript:') || urlLower.startsWith('data:')) {
    return false;
  }

  return true;
}

// GET /api/profile?did=xxx - Fetch a user's profile
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  try {
    // Get verified researcher info from app DB
    const [researcher] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, did))
      .limit(1);

    // Get profile data from app DB (may not exist yet)
    const [profile] = await db
      .select()
      .from(researcherProfiles)
      .where(eq(researcherProfiles.did, did))
      .limit(1);

    // Parse JSON fields safely
    const profileData = profile ? {
      shortBio: profile.shortBio,
      affiliation: profile.affiliation,
      disciplines: safeJsonParse<string[]>(profile.disciplines, []),
      links: safeJsonParse<ProfileLink[]>(profile.links, []),
      publicationVenues: safeJsonParse<string[]>(profile.publicationVenues, []),
      favoriteOwnPapers: safeJsonParse<ProfilePaper[]>(profile.favoriteOwnPapers, []),
      favoriteReadPapers: safeJsonParse<ProfilePaper[]>(profile.favoriteReadPapers, []),
      updatedAt: profile.updatedAt,
    } : null;

    // Return researcher info only if verified and active
    const researcherData = (researcher && researcher.isActive) ? {
      did: researcher.did,
      handle: researcher.handle,
      name: researcher.name,
      orcid: researcher.orcid || '',
      institution: researcher.institution,
      researchTopics: safeJsonParse<string[]>(researcher.researchTopics, []),
      verifiedAt: researcher.verifiedAt,
      openAlexId: researcher.openAlexId,
    } : null;

    return NextResponse.json({
      researcher: researcherData,
      profile: profileData,
    });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PUT /api/profile - Update own profile (any authenticated user)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, shortBio, affiliation, disciplines, links, publicationVenues, favoriteOwnPapers, favoriteReadPapers } = body;

    if (!did) {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Verify the user is authenticated and updating their own profile
    const auth = await verifyUserAccess(request, did);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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

    // Validate link structure and URLs
    if (links) {
      for (const link of links as ProfileLink[]) {
        if (!link.title || !link.url) {
          return NextResponse.json({ error: 'Links must have title and url' }, { status: 400 });
        }
        if (link.title.length > 100) {
          return NextResponse.json({ error: 'Link title too long (max 100 chars)' }, { status: 400 });
        }
        if (!isSafeUrl(link.url)) {
          return NextResponse.json({ error: 'Invalid link URL. Must be a valid http or https URL.' }, { status: 400 });
        }
        if (link.url.length > 2000) {
          return NextResponse.json({ error: 'Link URL too long (max 2000 chars)' }, { status: 400 });
        }
      }
    }

    // Validate paper structure and URLs
    const validatePapers = (papers: ProfilePaper[] | undefined, fieldName: string) => {
      if (!papers) return null;
      for (const paper of papers) {
        if (!paper.title || !paper.url) {
          return { error: `${fieldName} must have title and url` };
        }
        if (paper.title.length > 300) {
          return { error: `${fieldName} title too long (max 300 chars)` };
        }
        if (!isSafeUrl(paper.url)) {
          return { error: `Invalid ${fieldName.toLowerCase()} URL. Must be a valid http or https URL.` };
        }
        if (paper.url.length > 2000) {
          return { error: `${fieldName} URL too long (max 2000 chars)` };
        }
      }
      return null;
    };

    const ownPapersError = validatePapers(favoriteOwnPapers, 'Favorite own papers');
    if (ownPapersError) {
      return NextResponse.json(ownPapersError, { status: 400 });
    }

    const readPapersError = validatePapers(favoriteReadPapers, 'Favorite read papers');
    if (readPapersError) {
      return NextResponse.json(readPapersError, { status: 400 });
    }

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
