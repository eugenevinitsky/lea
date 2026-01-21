import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, establishedVenues } from '../db.js';

export interface OpenAlexAuthor {
  id: string;
  orcid?: string;
  displayName: string;
  worksCount: number;
  citedByCount: number;
  lastKnownInstitutions: Array<{
    id: string;
    displayName: string;
    countryCode?: string;
  }>;
  worksApiUrl: string;
}

export interface OpenAlexAuthorSearchResult {
  id: string;
  openAlexId: string; // Short form like A1234567890
  orcid?: string;
  displayName: string;
  worksCount: number;
  citedByCount: number;
  affiliations: Array<{
    institution: string;
    countryCode?: string;
  }>;
  recentWorks: Array<{
    title: string;
    year: number;
    venue?: string;
    doi?: string;
  }>;
}

export interface OpenAlexWork {
  id: string;
  title: string;
  publicationYear: number;
  publicationDate?: string;
  doi?: string;
  type: string;
  primaryLocation?: {
    source?: {
      id: string;
      displayName: string;
      issn?: string[];
      type: string;
    };
  };
}

export interface PublicationCheckResult {
  meetsAutoApprovalCriteria: boolean;
  totalWorks: number;
  worksAtEstablishedVenues: number;
  recentWorks: number; // Works in last 5 years
  author: OpenAlexAuthor | null;
  publications: OpenAlexWork[];
  reason?: string;
}

export class OpenAlexService {
  private baseUrl: string;
  private email: string;

  constructor() {
    this.baseUrl = config.openalex.apiUrl;
    this.email = config.openalex.email;
  }

  /**
   * Build request headers for OpenAlex API
   * OpenAlex requests a contact email for polite pool access
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.email) {
      headers['User-Agent'] = `LeaVerify/1.0 (mailto:${this.email})`;
    }
    return headers;
  }

  /**
   * Fetch author information from OpenAlex by ORCID
   */
  async getAuthorByOrcid(orcid: string): Promise<OpenAlexAuthor | null> {
    try {
      // OpenAlex accepts ORCID in format: orcid:0000-0000-0000-0000
      const url = `${this.baseUrl}/authors/orcid:${orcid}`;
      
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`No OpenAlex author found for ORCID: ${orcid}`);
          return null;
        }
        throw new Error(`OpenAlex API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        id: data.id,
        orcid: data.orcid,
        displayName: data.display_name,
        worksCount: data.works_count,
        citedByCount: data.cited_by_count,
        lastKnownInstitutions: (data.last_known_institutions || []).map((inst: any) => ({
          id: inst.id,
          displayName: inst.display_name,
          countryCode: inst.country_code,
        })),
        worksApiUrl: data.works_api_url,
      };
    } catch (error) {
      console.error('Failed to fetch author from OpenAlex:', error);
      return null;
    }
  }

  /**
   * Fetch works for an author
   */
  async getAuthorWorks(authorId: string, limit = 100): Promise<OpenAlexWork[]> {
    try {
      // Extract the OpenAlex author ID (e.g., A1234567890)
      const authorIdPart = authorId.split('/').pop();
      const url = `${this.baseUrl}/works?filter=author.id:${authorIdPart}&per_page=${limit}&sort=publication_year:desc`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`OpenAlex API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return (data.results || []).map((work: any) => ({
        id: work.id,
        title: work.title || 'Untitled',
        publicationYear: work.publication_year,
        publicationDate: work.publication_date,
        doi: work.doi,
        type: work.type,
        primaryLocation: work.primary_location ? {
          source: work.primary_location.source ? {
            id: work.primary_location.source.id,
            displayName: work.primary_location.source.display_name,
            issn: work.primary_location.source.issn,
            type: work.primary_location.source.type,
          } : undefined,
        } : undefined,
      }));
    } catch (error) {
      console.error('Failed to fetch works from OpenAlex:', error);
      return [];
    }
  }

  /**
   * Search for authors by name in OpenAlex
   * Returns authors with their ORCID (if available), affiliations, and recent works
   */
  async searchAuthorsByName(name: string, limit = 10): Promise<OpenAlexAuthorSearchResult[]> {
    try {
      // OpenAlex search API with display_name filter
      // Using search instead of filter for fuzzy matching
      const url = `${this.baseUrl}/authors?search=${encodeURIComponent(name)}&per_page=${limit}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(`OpenAlex search error: ${response.status}`);
        return [];
      }

      const data: any = await response.json();
      const results: OpenAlexAuthorSearchResult[] = [];

      for (const author of data.results || []) {
        // Extract short OpenAlex ID (e.g., A1234567890 from https://openalex.org/A1234567890)
        const openAlexId = author.id?.split('/').pop() || author.id;

        // Get recent works (fetch a few for display)
        const recentWorks: OpenAlexAuthorSearchResult['recentWorks'] = [];
        
        // OpenAlex includes x_concepts and some summary data, but for recent works
        // we need to query separately. For efficiency, we'll include top works from summary if available.
        // Actually, let's fetch a few works for each author
        try {
          const worksUrl = `${this.baseUrl}/works?filter=author.id:${openAlexId}&per_page=3&sort=publication_year:desc`;
          const worksResponse = await fetch(worksUrl, {
            headers: this.getHeaders(),
          });
          
          if (worksResponse.ok) {
            const worksData: any = await worksResponse.json();
            for (const work of worksData.results || []) {
              recentWorks.push({
                title: work.title || 'Untitled',
                year: work.publication_year,
                venue: work.primary_location?.source?.display_name,
                doi: work.doi,
              });
            }
          }
        } catch (err) {
          // Continue without works if fetch fails
          console.error(`Failed to fetch works for author ${openAlexId}:`, err);
        }

        // Use affiliations array which includes years count, sorted by years (most works)
        // Fall back to last_known_institutions if affiliations not available
        let affiliations: Array<{ institution: string; countryCode?: string }> = [];
        
        if (author.affiliations && author.affiliations.length > 0) {
          // Sort by years count (descending) to get most relevant affiliations first
          const sortedAffiliations = [...author.affiliations].sort((a: any, b: any) => {
            const yearsA = a.years?.length || 0;
            const yearsB = b.years?.length || 0;
            return yearsB - yearsA;
          });
          
          affiliations = sortedAffiliations.map((aff: any) => ({
            institution: aff.institution?.display_name || 'Unknown',
            countryCode: aff.institution?.country_code,
          }));
        } else if (author.last_known_institutions) {
          affiliations = author.last_known_institutions.map((inst: any) => ({
            institution: inst.display_name,
            countryCode: inst.country_code,
          }));
        }

        results.push({
          id: author.id,
          openAlexId,
          orcid: author.orcid ? author.orcid.replace('https://orcid.org/', '') : undefined,
          displayName: author.display_name,
          worksCount: author.works_count || 0,
          citedByCount: author.cited_by_count || 0,
          affiliations,
          recentWorks,
        });
      }

      return results;
    } catch (error) {
      console.error('Failed to search authors in OpenAlex:', error);
      return [];
    }
  }

  /**
   * Get author by OpenAlex ID
   */
  async getAuthorById(openAlexId: string): Promise<OpenAlexAuthor | null> {
    try {
      const url = `${this.baseUrl}/authors/${openAlexId}`;
      
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`No OpenAlex author found for ID: ${openAlexId}`);
          return null;
        }
        throw new Error(`OpenAlex API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        id: data.id,
        orcid: data.orcid ? data.orcid.replace('https://orcid.org/', '') : undefined,
        displayName: data.display_name,
        worksCount: data.works_count,
        citedByCount: data.cited_by_count,
        lastKnownInstitutions: (data.last_known_institutions || []).map((inst: any) => ({
          id: inst.id,
          displayName: inst.display_name,
          countryCode: inst.country_code,
        })),
        worksApiUrl: data.works_api_url,
      };
    } catch (error) {
      console.error('Failed to fetch author from OpenAlex:', error);
      return null;
    }
  }

  /**
   * Check if an ORCID meets auto-approval criteria:
   * - ≥3 works at established venues
   * - ≥1 work in the last 5 years
   */
  async checkAutoApprovalCriteria(orcid: string): Promise<PublicationCheckResult> {
    const result: PublicationCheckResult = {
      meetsAutoApprovalCriteria: false,
      totalWorks: 0,
      worksAtEstablishedVenues: 0,
      recentWorks: 0,
      author: null,
      publications: [],
    };

    // Fetch author
    const author = await this.getAuthorByOrcid(orcid);
    if (!author) {
      result.reason = 'Author not found in OpenAlex';
      return result;
    }
    result.author = author;
    result.totalWorks = author.worksCount;

    // Fetch works
    const works = await this.getAuthorWorks(author.id);
    result.publications = works;

    // Get established venues from database (Drizzle query)
    const venues = await db
      .select()
      .from(establishedVenues)
      .where(eq(establishedVenues.isActive, true));
    
    const establishedVenueIds = new Set(
      venues.map((v) => v.openalexSourceId).filter(Boolean)
    );

    // Calculate cutoff year (5 years ago)
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 5;

    // Count works at established venues and recent works
    for (const work of works) {
      // Check if recent
      if (work.publicationYear >= cutoffYear) {
        result.recentWorks++;
      }

      // Check if at established venue
      const venueId = work.primaryLocation?.source?.id;
      if (venueId && establishedVenueIds.has(venueId)) {
        result.worksAtEstablishedVenues++;
      }
    }

    // Check criteria
    const hasEnoughEstablishedWorks = result.worksAtEstablishedVenues >= 3;
    const hasRecentWork = result.recentWorks >= 1;

    result.meetsAutoApprovalCriteria = hasEnoughEstablishedWorks && hasRecentWork;

    if (!hasEnoughEstablishedWorks) {
      result.reason = `Only ${result.worksAtEstablishedVenues}/3 works at established venues`;
    } else if (!hasRecentWork) {
      result.reason = 'No works published in the last 5 years';
    }

    return result;
  }
}

// Singleton instance
export const openAlexService = new OpenAlexService();
export default openAlexService;
