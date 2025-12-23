// OpenAlex API integration (via Next.js API routes to avoid CORS)
// Docs: https://docs.openalex.org/

export interface OpenAlexAuthor {
  id: string;
  orcid?: string;
  display_name: string;
  works_count: number;
  cited_by_count: number;
  last_known_institution?: {
    id: string;
    display_name: string;
    country_code: string;
    type: string;
  };
  works_api_url: string;
}

export interface OpenAlexWork {
  id: string;
  title: string;
  publication_year: number;
  publication_date: string;
  type: string;
  doi?: string;
  primary_location?: {
    source?: {
      id: string;
      display_name: string;
      issn_l?: string;
      type: string;
    };
  };
  authorships: Array<{
    author: {
      id: string;
      display_name: string;
    };
    institutions: Array<{
      id: string;
      display_name: string;
    }>;
  }>;
  topics?: Array<{
    id: string;
    display_name: string;
    subfield: { display_name: string };
    field: { display_name: string };
    domain: { display_name: string };
  }>;
}

export interface OpenAlexWorksResponse {
  meta: {
    count: number;
    page: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

// Fetch author by ORCID (via API route)
export async function getAuthorByOrcid(orcid: string): Promise<OpenAlexAuthor | null> {
  const normalizedOrcid = orcid.replace('https://orcid.org/', '');

  try {
    const response = await fetch(`/api/openalex/author?orcid=${encodeURIComponent(normalizedOrcid)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results[0] as OpenAlexAuthor;
    }

    return null;
  } catch (error) {
    console.error('Error fetching author from OpenAlex:', error);
    throw error;
  }
}

// Fetch works for an author (via API route)
export async function getAuthorWorks(
  authorId: string,
  options: { perPage?: number; page?: number } = {}
): Promise<OpenAlexWorksResponse> {
  const { perPage = 50, page = 1 } = options;

  try {
    const params = new URLSearchParams({
      authorId,
      perPage: perPage.toString(),
      page: page.toString(),
    });

    const response = await fetch(`/api/openalex/works?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching works from OpenAlex:', error);
    throw error;
  }
}
