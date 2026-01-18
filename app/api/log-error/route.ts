import { NextRequest, NextResponse } from 'next/server';

// Patterns that might indicate sensitive data in logs
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/gi, // JWT tokens
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, // Base64 JWT
  /token["\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, // Generic tokens
  /password["\s:=]+["']?[^"'\s]{4,}["']?/gi, // Passwords
  /secret["\s:=]+["']?[^"'\s]{4,}["']?/gi, // Secrets
  /api[_-]?key["\s:=]+["']?[A-Za-z0-9\-_]{16,}["']?/gi, // API keys
  /authorization["\s:=]+["']?[^"'\s]{10,}["']?/gi, // Auth headers
];

// Redact sensitive data from strings
function redactSensitive(str: string | undefined | null): string {
  if (!str) return '';
  let redacted = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

// Truncate long strings
function truncate(str: string, maxLen: number = 2000): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '... [truncated]';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, errorInfo, userAgent, url, timestamp } = body;

    // Validate and sanitize inputs
    const safeUrl = typeof url === 'string' ? truncate(url, 500) : 'unknown';
    const safeUserAgent = typeof userAgent === 'string' ? truncate(userAgent, 300) : 'unknown';
    const safeTimestamp = typeof timestamp === 'string' ? timestamp.slice(0, 50) : new Date().toISOString();
    const safeErrorName = typeof error?.name === 'string' ? error.name.slice(0, 100) : 'UnknownError';
    const safeErrorMessage = typeof error?.message === 'string'
      ? truncate(redactSensitive(error.message), 500)
      : 'No message';
    const safeStack = typeof error?.stack === 'string'
      ? truncate(redactSensitive(error.stack))
      : '';
    const safeComponentStack = typeof errorInfo?.componentStack === 'string'
      ? truncate(redactSensitive(errorInfo.componentStack))
      : '';

    // Log to server console (visible in Vercel logs)
    console.error('=== CLIENT ERROR REPORT ===');
    console.error('Timestamp:', safeTimestamp);
    console.error('URL:', safeUrl);
    console.error('User Agent:', safeUserAgent);
    console.error('Error:', safeErrorName, '-', safeErrorMessage);
    if (safeStack) {
      console.error('Stack:', safeStack);
    }
    if (safeComponentStack) {
      console.error('Component Stack:', safeComponentStack);
    }
    console.error('=== END ERROR REPORT ===');

    return NextResponse.json({ logged: true });
  } catch (e) {
    console.error('Failed to log client error');
    return NextResponse.json({ logged: false }, { status: 500 });
  }
}
