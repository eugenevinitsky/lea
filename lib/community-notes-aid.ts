import { createHash } from 'crypto';

const AID_SECRET = process.env.COMMUNITY_NOTES_AID_SECRET;

/**
 * Compute an anonymous ID for OCN spec compatibility.
 * Deterministic: same DID always produces the same AID.
 *
 * Format: "anon:" + base32(SHA256(did + secret))[0:24]
 */
export function computeAid(did: string): string {
  if (!AID_SECRET) {
    throw new Error('COMMUNITY_NOTES_AID_SECRET environment variable is required');
  }

  const hash = createHash('sha256')
    .update(did + AID_SECRET)
    .digest();

  // RFC 4648 base32 encoding (uppercase, no padding)
  const base32 = base32Encode(hash);
  return `anon:${base32.slice(0, 24).toLowerCase()}`;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}
