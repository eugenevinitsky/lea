import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';

// Extend Request type to include admin info
declare global {
  namespace Express {
    interface Request {
      adminDid?: string;
    }
  }
}

// Timing-safe comparison to prevent timing attacks on API key verification
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Simple API key authentication for admin routes
 * In production, this should be replaced with proper OAuth or JWT auth
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!config.adminApiKey || !secureCompare(apiKey, config.adminApiKey)) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  // In a real implementation, you'd decode the token to get the admin's DID
  req.adminDid = config.ozone.adminDid || 'admin';
  
  next();
}

/**
 * Rate limiting middleware for public endpoints
 * Uses express-rate-limit in the main server setup
 */
export function createRateLimiter(windowMs: number, max: number) {
  // This is a placeholder - actual rate limiter is set up in index.ts
  return { windowMs, max };
}
