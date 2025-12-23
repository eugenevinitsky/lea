import { NextResponse } from 'next/server';
import { getCommunityListUri } from '@/lib/services/list-manager';

export async function GET() {
  try {
    const listUri = await getCommunityListUri();

    if (!listUri) {
      return NextResponse.json(
        { error: 'Community list not created yet' },
        { status: 404 }
      );
    }

    return NextResponse.json({ listUri });
  } catch (error) {
    console.error('Failed to get list URI:', error);
    return NextResponse.json(
      { error: 'Failed to get list URI' },
      { status: 500 }
    );
  }
}
