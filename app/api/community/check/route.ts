import { NextRequest, NextResponse } from 'next/server';
import { isInCommunity } from '@/lib/services/hop-computation';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const did = searchParams.get('did');

  if (!did) {
    return NextResponse.json(
      { error: 'Missing did parameter' },
      { status: 400 }
    );
  }

  try {
    const result = await isInCommunity(did);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Community check error:', error);
    return NextResponse.json(
      { error: 'Failed to check community membership' },
      { status: 500 }
    );
  }
}
