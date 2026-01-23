'use client';

import { useState, useEffect } from 'react';
import { getSession } from '@/lib/bluesky';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';
import ProfileView from './ProfileView';

interface ProfileEditorProps {
  onClose: () => void;
}

interface ProfileData {
  shortBio: string;
  affiliation: string;
  disciplines: string[];
  links: ProfileLink[];
  publicationVenues: string[];
  favoriteOwnPapers: ProfilePaper[];
  favoriteReadPapers: ProfilePaper[];
}

const emptyPaper: ProfilePaper = { title: '', url: '', authors: '', year: '' };
const emptyLink: ProfileLink = { title: '', url: '' };

export default function ProfileEditor({ onClose }: ProfileEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notVerified, setNotVerified] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({
    shortBio: '',
    affiliation: '',
    disciplines: [],
    links: [],
    publicationVenues: [],
    favoriteOwnPapers: [],
    favoriteReadPapers: [],
  });

  // Temp state for comma-separated inputs
  const [disciplinesInput, setDisciplinesInput] = useState('');
  const [venuesInput, setVenuesInput] = useState('');
  
  // Track if topics were auto-populated from OpenAlex
  const [topicsAutoPopulated, setTopicsAutoPopulated] = useState(false);
  
  // Researcher IDs
  const [orcid, setOrcid] = useState('');
  const [openAlexId, setOpenAlexId] = useState('');
  const [idsSaving, setIdsSaving] = useState(false);
  const [idsError, setIdsError] = useState<string | null>(null);
  const [idsSuccess, setIdsSuccess] = useState(false);

  const session = getSession();

  useEffect(() => {
    async function fetchProfile() {
      if (!session?.did) return;

      try {
        const res = await fetch(`/api/profile?did=${encodeURIComponent(session.did)}`);
        if (res.status === 404) {
          setNotVerified(true);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch profile');
        const data = await res.json();

        // Use profile disciplines if set, otherwise fall back to auto-populated research topics
        const disciplines = data.profile?.disciplines?.length > 0 
          ? data.profile.disciplines 
          : (data.researcher?.researchTopics || []);
        
        // Track if we're using auto-populated topics
        if (!data.profile?.disciplines?.length && data.researcher?.researchTopics?.length > 0) {
          setTopicsAutoPopulated(true);
        }

        setProfile({
          shortBio: data.profile?.shortBio || '',
          affiliation: data.profile?.affiliation || data.researcher?.institution || '',
          disciplines: disciplines,
          links: data.profile?.links || [],
          publicationVenues: data.profile?.publicationVenues || [],
          favoriteOwnPapers: data.profile?.favoriteOwnPapers || [],
          favoriteReadPapers: data.profile?.favoriteReadPapers || [],
        });
        
        // Set researcher IDs
        setOrcid(data.researcher?.orcid || '');
        setOpenAlexId(data.researcher?.openAlexId || '');
        setDisciplinesInput(disciplines.join(', '));
        setVenuesInput((data.profile?.publicationVenues || []).join(', '));
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [session?.did]);

  const handleSave = async () => {
    if (!session?.did) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Parse comma-separated inputs
      const disciplines = disciplinesInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5);

      const publicationVenues = venuesInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5);

      // Filter out empty papers and links
      const links = profile.links.filter((l) => l.title && l.url).slice(0, 3);
      const favoriteOwnPapers = profile.favoriteOwnPapers
        .filter((p) => p.title && p.url)
        .slice(0, 3);
      const favoriteReadPapers = profile.favoriteReadPapers
        .filter((p) => p.title && p.url)
        .slice(0, 3);

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: session.did,
          shortBio: profile.shortBio || null,
          affiliation: profile.affiliation || null,
          disciplines: disciplines.length > 0 ? disciplines : null,
          links: links.length > 0 ? links : null,
          publicationVenues: publicationVenues.length > 0 ? publicationVenues : null,
          favoriteOwnPapers: favoriteOwnPapers.length > 0 ? favoriteOwnPapers : null,
          favoriteReadPapers: favoriteReadPapers.length > 0 ? favoriteReadPapers : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save profile');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const updateLink = (index: number, field: keyof ProfileLink, value: string) => {
    const newLinks = [...profile.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setProfile({ ...profile, links: newLinks });
  };

  const addLink = () => {
    if (profile.links.length < 3) {
      setProfile({ ...profile, links: [...profile.links, { ...emptyLink }] });
    }
  };

  const removeLink = (index: number) => {
    setProfile({ ...profile, links: profile.links.filter((_, i) => i !== index) });
  };

  const updatePaper = (
    list: 'favoriteOwnPapers' | 'favoriteReadPapers',
    index: number,
    field: keyof ProfilePaper,
    value: string
  ) => {
    const newPapers = [...profile[list]];
    newPapers[index] = { ...newPapers[index], [field]: value };
    setProfile({ ...profile, [list]: newPapers });
  };

  const addPaper = (list: 'favoriteOwnPapers' | 'favoriteReadPapers') => {
    if (profile[list].length < 3) {
      setProfile({ ...profile, [list]: [...profile[list], { ...emptyPaper }] });
    }
  };

  const removePaper = (list: 'favoriteOwnPapers' | 'favoriteReadPapers', index: number) => {
    setProfile({ ...profile, [list]: profile[list].filter((_, i) => i !== index) });
  };

  const handleSaveIds = async () => {
    if (!session?.did) return;

    setIdsSaving(true);
    setIdsError(null);
    setIdsSuccess(false);

    try {
      const res = await fetch('/api/profile/ids', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: session.did,
          orcid: orcid || undefined,
          openAlexId: openAlexId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save IDs');
      }

      setIdsSuccess(true);
      setTimeout(() => setIdsSuccess(false), 3000);
    } catch (err) {
      setIdsError(err instanceof Error ? err.message : 'Failed to save IDs');
    } finally {
      setIdsSaving(false);
    }
  };

  // Show profile preview
  if (showPreview && session?.did) {
    return (
      <ProfileView
        did={session.did}
        onClose={() => setShowPreview(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Profile</h2>
          <div className="flex items-center gap-2">
            {!loading && !notVerified && (
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Profile
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : notVerified ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Verification Required
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Only verified researchers can create profiles. Contact a moderator to get verified.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Researcher IDs Section */}
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg space-y-4">
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Researcher Identifiers
                </h3>
                
                {/* ORCID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ORCID
                  </label>
                  <input
                    type="text"
                    value={orcid}
                    onChange={(e) => setOrcid(e.target.value)}
                    placeholder="0000-0000-0000-0000"
                    maxLength={19}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Your ORCID identifier (e.g., 0000-0002-1825-0097)
                  </p>
                </div>

                {/* OpenAlex ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    OpenAlex ID
                  </label>
                  <input
                    type="text"
                    value={openAlexId}
                    onChange={(e) => setOpenAlexId(e.target.value)}
                    placeholder="A1234567890 or OpenAlex URL"
                    maxLength={100}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Your OpenAlex author ID (e.g., A5023888391 or full URL)
                  </p>
                </div>

                {/* IDs Error/Success Messages */}
                {idsError && (
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {idsError}
                  </div>
                )}
                {idsSuccess && (
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
                    IDs saved successfully!
                  </div>
                )}

                {/* Save IDs Button */}
                <button
                  onClick={handleSaveIds}
                  disabled={idsSaving}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm"
                >
                  {idsSaving && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Save IDs
                </button>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Short Bio
                </label>
                <textarea
                  value={profile.shortBio}
                  onChange={(e) => setProfile({ ...profile, shortBio: e.target.value })}
                  placeholder="A brief description of your research interests..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              <p className="text-xs text-gray-400 mt-1">{profile.shortBio.length}/500</p>
              </div>

              {/* Affiliation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Affiliation
                </label>
                <input
                  type="text"
                  value={profile.affiliation}
                  onChange={(e) => setProfile({ ...profile, affiliation: e.target.value })}
                  placeholder="e.g., Stanford University, Google Research"
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Research Topics */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Research Topics
                </label>
                <input
                  type="text"
                  value={disciplinesInput}
                  onChange={(e) => {
                    setDisciplinesInput(e.target.value);
                    setTopicsAutoPopulated(false);
                  }}
                  placeholder="e.g., NLP, Computational Social Science, HCI"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {topicsAutoPopulated 
                    ? 'Auto-populated from your publications (edit to customize)' 
                    : 'Comma-separated, max 5'}
                </p>
              </div>

              {/* Links */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Links (up to 3)
                </label>
                <div className="space-y-3">
                  {profile.links.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={link.title}
                        onChange={(e) => updateLink(i, 'title', e.target.value)}
                        placeholder="Title (e.g., Personal Website)"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) => updateLink(i, 'url', e.target.value)}
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        onClick={() => removeLink(i)}
                        className="p-2 text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {profile.links.length < 3 && (
                    <button
                      onClick={addLink}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add link
                    </button>
                  )}
                </div>
              </div>

              {/* Publication Venues */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Primary Publication Venues
                </label>
                <input
                  type="text"
                  value={venuesInput}
                  onChange={(e) => setVenuesInput(e.target.value)}
                  placeholder="e.g., ACL, NeurIPS, Nature, JAMA"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated, max 5</p>
              </div>

              {/* Favorite Own Papers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Favorite Papers You&apos;ve Written (up to 3)
                </label>
                <div className="space-y-4">
                  {profile.favoriteOwnPapers.map((paper, i) => (
                    <PaperInput
                      key={i}
                      paper={paper}
                      onChange={(field, value) => updatePaper('favoriteOwnPapers', i, field, value)}
                      onRemove={() => removePaper('favoriteOwnPapers', i)}
                    />
                  ))}
                  {profile.favoriteOwnPapers.length < 3 && (
                    <button
                      onClick={() => addPaper('favoriteOwnPapers')}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add paper
                    </button>
                  )}
                </div>
              </div>

              {/* Favorite Read Papers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Papers You Recommend (up to 3)
                </label>
                <div className="space-y-4">
                  {profile.favoriteReadPapers.map((paper, i) => (
                    <PaperInput
                      key={i}
                      paper={paper}
                      onChange={(field, value) => updatePaper('favoriteReadPapers', i, field, value)}
                      onRemove={() => removePaper('favoriteReadPapers', i)}
                    />
                  ))}
                  {profile.favoriteReadPapers.length < 3 && (
                    <button
                      onClick={() => addPaper('favoriteReadPapers')}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add paper
                    </button>
                  )}
                </div>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
                  Profile saved successfully!
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {saving && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Save Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PaperInputProps {
  paper: ProfilePaper;
  onChange: (field: keyof ProfilePaper, value: string) => void;
  onRemove: () => void;
}

function PaperInput({ paper, onChange, onRemove }: PaperInputProps) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
      <div className="flex justify-between items-start">
        <input
          type="text"
          value={paper.title}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="Paper title"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={onRemove}
          className="ml-2 p-2 text-gray-400 hover:text-red-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <input
        type="text"
        value={paper.authors}
        onChange={(e) => onChange('authors', e.target.value)}
        placeholder="Authors (e.g., Smith et al.)"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={paper.venue || ''}
          onChange={(e) => onChange('venue', e.target.value)}
          placeholder="Venue (e.g., NeurIPS 2024)"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          value={paper.year}
          onChange={(e) => onChange('year', e.target.value)}
          placeholder="Year"
          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <input
        type="url"
        value={paper.url}
        onChange={(e) => onChange('url', e.target.value)}
        placeholder="Link to paper (https://...)"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
