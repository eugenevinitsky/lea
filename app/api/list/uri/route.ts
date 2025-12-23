import { NextRequest, NextResponse } from 'next/server';
import { getCommunityListUri, getVerifiedOnlyListUri } from '@/lib/services/list-manager';

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'community';

    let listUri: string | null;
    if (type === 'verified') {
      listUri = await getVerifiedOnlyListUri();
    } else {
      listUri = await getCommunityListUri();
    }

    if (!listUri) {
      return NextResponse.json(
        { error: `${type} list not created yet` },
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
