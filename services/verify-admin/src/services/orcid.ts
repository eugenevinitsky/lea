import { config } from '../config.js';

export interface OrcidProfile {
  orcid: string;
  name?: string;
  givenNames?: string;
  familyName?: string;
}

export class OrcidService {
  /**
   * Validate ORCID format and checksum
   * ORCID format: 0000-0000-0000-000X (where X is 0-9 or X)
   */
  validateOrcidFormat(orcid: string): boolean {
    // Remove any URL prefix if present
    const cleanOrcid = this.extractOrcidId(orcid);
    
    // Check format: 4 groups of 4 digits, last char can be X
    const formatRegex = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
    if (!formatRegex.test(cleanOrcid)) {
      return false;
    }

    // Validate checksum using ISO 7064 Mod 11-2
    return this.validateOrcidChecksum(cleanOrcid);
  }

  /**
   * Extract ORCID ID from various formats (URL, bare ID, etc.)
   */
  extractOrcidId(input: string): string {
    // Handle full URLs like https://orcid.org/0000-0000-0000-0000
    const urlMatch = input.match(/orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Already in correct format
    if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(input)) {
      return input;
    }

    // Compact format without dashes (16 chars)
    if (/^\d{15}[\dX]$/.test(input)) {
      return `${input.slice(0, 4)}-${input.slice(4, 8)}-${input.slice(8, 12)}-${input.slice(12, 16)}`;
    }

    return input;
  }

  /**
   * Validate ORCID checksum using ISO 7064 Mod 11-2 algorithm
   */
  private validateOrcidChecksum(orcid: string): boolean {
    // Remove dashes
    const digits = orcid.replace(/-/g, '');
    
    let total = 0;
    for (let i = 0; i < digits.length - 1; i++) {
      const digit = parseInt(digits[i], 10);
      total = (total + digit) * 2;
    }

    const remainder = total % 11;
    const checkDigit = (12 - remainder) % 11;
    const expectedCheck = checkDigit === 10 ? 'X' : checkDigit.toString();
    
    return digits[digits.length - 1].toUpperCase() === expectedCheck;
  }

  /**
   * Generate ORCID OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.orcid.clientId,
      response_type: 'code',
      scope: '/authenticate',
      redirect_uri: config.orcid.redirectUri,
      state,
    });

    return `https://orcid.org/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token and ORCID
   */
  async exchangeAuthCode(code: string): Promise<{
    orcid: string;
    accessToken: string;
    name?: string;
  } | null> {
    try {
      const response = await fetch('https://orcid.org/oauth/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.orcid.clientId,
          client_secret: config.orcid.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.orcid.redirectUri,
        }).toString(),
      });

      if (!response.ok) {
        console.error('ORCID token exchange failed:', await response.text());
        return null;
      }

      const data: any = await response.json();
      
      return {
        orcid: data.orcid,
        accessToken: data.access_token,
        name: data.name,
      };
    } catch (error) {
      console.error('Failed to exchange ORCID auth code:', error);
      return null;
    }
  }

  /**
   * Fetch ORCID profile from public API
   */
  async getProfile(orcid: string): Promise<OrcidProfile | null> {
    try {
      const cleanOrcid = this.extractOrcidId(orcid);
      const url = `${config.orcid.apiUrl}/${cleanOrcid}/person`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`ORCID API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        orcid: cleanOrcid,
        name: data.name?.['credit-name']?.value,
        givenNames: data.name?.['given-names']?.value,
        familyName: data.name?.['family-name']?.value,
      };
    } catch (error) {
      console.error('Failed to fetch ORCID profile:', error);
      return null;
    }
  }
}

// Singleton instance
export const orcidService = new OrcidService();
export default orcidService;
