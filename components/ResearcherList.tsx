'use client';

import { useState, useEffect } from 'react';
import { getBlueskyProfile } from '@/lib/bluesky';

interface Researcher {
  did: string;
  handle: string | null;
  name: string | null;
  orcid: string;
  institution: string | null;
  researchTopics: string[];
  publicationVenues: string[];
}

interface ResearcherListProps {
  field: 'affiliation' | 'topic' | 'venue';
  value: string;
  onSelectResearcher: (did: string) => void;
}

export default function ResearcherList({ field, value, onSelectResearcher }: ResearcherListProps) {
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResearchers() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/researchers/by-field?field=${field}&value=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error('Failed to fetch researchers');
        const data = await res.json();
        setResearchers(data.researchers || []);
        
        // Fetch avatars for each researcher
        const avatarPromises = (data.researchers || []).map(async (r: Researcher) => {
          const profile = await getBlueskyProfile(r.did);
          return { did: r.did, avatar: profile?.avatar };
        });
        const avatarResults = await Promise.all(avatarPromises);
        const avatarMap: Record<string, string> = {};
        avatarResults.forEach(({ did, avatar }) => {
          if (avatar) avatarMap[did] = avatar;
        });
        setAvatars(avatarMap);
      } catch (err) {
        console.error('Failed to fetch researchers:', err);
        setError('Failed to load researchers');
      } finally {
        setLoading(false);
      }
    }
    
    fetchResearchers();
  }, [field, value]);

  const fieldLabel = {
    affiliation: 'Affiliation',
    topic: 'Research Topic',
    venue: 'Publication Venue',
  }[field];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 px-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">{fieldLabel}</p>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {researchers.length} researcher{researchers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Researcher list */}
      {researchers.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-gray-500">No researchers found with this {fieldLabel.toLowerCase()}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {researchers.map((researcher) => (
            <button
              key={researcher.did}
              onClick={() => onSelectResearcher(researcher.did)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors text-left"
            >
              {avatars[researcher.did] ? (
                <img
                  src={avatars[researcher.did]}
                  alt=""
                  className="w-12 h-12 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0 flex items-center justify-center text-white font-bold">
                  {(researcher.name || researcher.handle || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {researcher.name || researcher.handle || 'Unknown'}
                  </span>
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex-shrink-0"
                    title="Verified Researcher"
                  >
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
                {researcher.handle && (
                  <p className="text-sm text-gray-500 truncate">@{researcher.handle}</p>
                )}
                {researcher.institution && (
                  <p className="text-sm text-purple-600 dark:text-purple-400 truncate mt-0.5">
                    {researcher.institution}
                  </p>
                )}
                {researcher.researchTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {researcher.researchTopics.slice(0, 3).map((topic, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs"
                      >
                        {topic}
                      </span>
                    ))}
                    {researcher.researchTopics.length > 3 && (
                      <span className="text-xs text-gray-400">
                        +{researcher.researchTopics.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
