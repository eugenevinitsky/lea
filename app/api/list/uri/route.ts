import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedOnlyListUri, getPersonalListUri } from '@/lib/services/list-manager';

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'verified';
    const did = request.nextUrl.searchParams.get('did');

    let listUri: string | null;
    if (type === 'personal') {
      if (!did) {
        return NextResponse.json(
          { error: 'did parameter required for personal list' },
          { status: 400 }
        );
      }
      listUri = await getPersonalListUri(did);
    } else {
      // Default to verified list
      listUri = await getVerifiedOnlyListUri();
    }

    if (!listUri) {
      return NextResponse.json(
        { error: 'List not created yet' },
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
