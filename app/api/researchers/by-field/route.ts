import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers, researcherProfiles } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

// Search researchers by a specific field value
// GET /api/researchers/by-field?field=affiliation&value=MIT
// GET /api/researchers/by-field?field=topic&value=NLP
// GET /api/researchers/by-field?field=venue&value=ACL

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const field = searchParams.get('field');
  const value = searchParams.get('value');

  if (!field || !value) {
    return NextResponse.json(
      { error: 'Missing field or value parameter' },
      { status: 400 }
    );
  }

  try {
    let researchers: {
      did: string;
      handle: string | null;
      name: string | null;
      orcid: string;
      institution: string | null;
      researchTopics: string | null;
      affiliation: string | null;
      disciplines: string | null;
      publicationVenues: string | null;
    }[] = [];

    if (field === 'affiliation') {
      // Search by affiliation in researcher_profiles table
      // Also check institution in verified_researchers for those without profile
      researchers = await db
        .select({
          did: verifiedResearchers.did,
          handle: verifiedResearchers.handle,
          name: verifiedResearchers.name,
          orcid: verifiedResearchers.orcid,
          institution: verifiedResearchers.institution,
          researchTopics: verifiedResearchers.researchTopics,
          affiliation: researcherProfiles.affiliation,
          disciplines: researcherProfiles.disciplines,
          publicationVenues: researcherProfiles.publicationVenues,
        })
        .from(verifiedResearchers)
        .leftJoin(researcherProfiles, eq(verifiedResearchers.did, researcherProfiles.did))
        .where(
          sql`${verifiedResearchers.isActive} = true AND (
            ${researcherProfiles.affiliation} = ${value} OR 
            (${researcherProfiles.affiliation} IS NULL AND ${verifiedResearchers.institution} = ${value})
          )`
        );
    } else if (field === 'topic') {
      // Search by discipline in researcher_profiles or researchTopics in verified_researchers
      // disciplines is a JSON array stored as text
      researchers = await db
        .select({
          did: verifiedResearchers.did,
          handle: verifiedResearchers.handle,
          name: verifiedResearchers.name,
          orcid: verifiedResearchers.orcid,
          institution: verifiedResearchers.institution,
          researchTopics: verifiedResearchers.researchTopics,
          affiliation: researcherProfiles.affiliation,
          disciplines: researcherProfiles.disciplines,
          publicationVenues: researcherProfiles.publicationVenues,
        })
        .from(verifiedResearchers)
        .leftJoin(researcherProfiles, eq(verifiedResearchers.did, researcherProfiles.did))
        .where(
          sql`${verifiedResearchers.isActive} = true AND (
            ${researcherProfiles.disciplines}::jsonb ? ${value} OR 
            (${researcherProfiles.disciplines} IS NULL AND ${verifiedResearchers.researchTopics}::jsonb ? ${value})
          )`
        );
    } else if (field === 'venue') {
      // Search by publicationVenues in researcher_profiles
      // publicationVenues is a JSON array stored as text
      researchers = await db
        .select({
          did: verifiedResearchers.did,
          handle: verifiedResearchers.handle,
          name: verifiedResearchers.name,
          orcid: verifiedResearchers.orcid,
          institution: verifiedResearchers.institution,
          researchTopics: verifiedResearchers.researchTopics,
          affiliation: researcherProfiles.affiliation,
          disciplines: researcherProfiles.disciplines,
          publicationVenues: researcherProfiles.publicationVenues,
        })
        .from(verifiedResearchers)
        .leftJoin(researcherProfiles, eq(verifiedResearchers.did, researcherProfiles.did))
        .where(
          sql`${verifiedResearchers.isActive} = true AND ${researcherProfiles.publicationVenues}::jsonb ? ${value}`
        );
    } else {
      return NextResponse.json(
        { error: 'Invalid field. Must be one of: affiliation, topic, venue' },
        { status: 400 }
      );
    }

    // Parse JSON fields and format response
    const formattedResearchers = researchers.map(r => ({
      did: r.did,
      handle: r.handle,
      name: r.name,
      orcid: r.orcid,
      institution: r.affiliation || r.institution,
      researchTopics: r.disciplines 
        ? JSON.parse(r.disciplines) 
        : (r.researchTopics ? JSON.parse(r.researchTopics) : []),
      publicationVenues: r.publicationVenues ? JSON.parse(r.publicationVenues) : [],
    }));

    return NextResponse.json({
      researchers: formattedResearchers,
      field,
      value,
      count: formattedResearchers.length,
    }, {
      headers: {
        // Cache at CDN for 5 minutes, stale-while-revalidate for 10 min
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to search researchers by field:', error);
    return NextResponse.json(
      { error: 'Failed to search researchers' },
      { status: 500 }
    );
  }
}
