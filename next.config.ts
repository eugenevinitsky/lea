import type { NextConfig } from "next";

const securityHeaders = [
  {
    // Prevent clickjacking by disallowing iframe embedding
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Prevent MIME-type sniffing
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Enable XSS filter in older browsers
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    // Control referrer information sent with requests
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Restrict browser features/APIs
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    // Content Security Policy - adjust as needed for your app
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com", // Next.js requires unsafe-inline/eval
      "style-src 'self' 'unsafe-inline'", // For inline styles
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://bsky.social https://public.api.bsky.app https://*.bsky.network https://video.bsky.app https://video.cdn.bsky.app https://plc.directory wss://*.bsky.network https://lea-moderation-production.up.railway.app",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Force trailing slashes to prevent dots being interpreted as file extensions
  trailingSlash: true,

  // Add security headers to all responses
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
