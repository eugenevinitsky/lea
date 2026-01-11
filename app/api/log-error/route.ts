import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, errorInfo, userAgent, url, timestamp } = body;

    // Log to server console (visible in Vercel logs)
    console.error('=== CLIENT ERROR REPORT ===');
    console.error('Timestamp:', timestamp);
    console.error('URL:', url);
    console.error('User Agent:', userAgent);
    console.error('Error:', error?.name, '-', error?.message);
    console.error('Stack:', error?.stack);
    if (errorInfo?.componentStack) {
      console.error('Component Stack:', errorInfo.componentStack);
    }
    console.error('=== END ERROR REPORT ===');

    return NextResponse.json({ logged: true });
  } catch (e) {
    console.error('Failed to log client error:', e);
    return NextResponse.json({ logged: false }, { status: 500 });
  }
}
