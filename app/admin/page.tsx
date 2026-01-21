'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_VERIFY_ADMIN_URL || 'http://localhost:3001';

interface Stats {
  researchers: number;
  organizations: {
    total: number;
    byType: Array<{ type: string; count: number }>;
  };
}

interface LabelLocale {
  lang: string;
  name: string;
  description: string;
}

interface LabelDefinition {
  identifier: string;
  severity: 'inform' | 'alert' | 'none';
  blurs: 'content' | 'media' | 'none';
  defaultSetting: 'ignore' | 'warn' | 'hide';
  adultOnly: boolean;
  locales: LabelLocale[];
}

const ORG_TYPE_LABELS: Record<string, string> = {
  VENUE: 'Venue',
  LAB: 'Research Lab',
  ACADEMIC_INSTITUTION: 'Academic Institution',
  INDUSTRY_INSTITUTION: 'Industry Institution',
};

export default function AdminPage() {
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Quick verify state
  const [showQuickVerify, setShowQuickVerify] = useState(true);
  const [quickVerifyHandle, setQuickVerifyHandle] = useState('');
  const [quickVerifyNameOverride, setQuickVerifyNameOverride] = useState('');
  const [quickVerifyLoading, setQuickVerifyLoading] = useState(false);
  const [quickVerifySuccess, setQuickVerifySuccess] = useState<string | null>(null);
  
  // OpenAlex author search state
  const authorDropdownRef = useRef<HTMLDivElement>(null);
  const [authorSearchQuery, setAuthorSearchQuery] = useState('');
  const [authorSearchResults, setAuthorSearchResults] = useState<Array<{
    id: string;
    openAlexId: string;
    orcid?: string;
    displayName: string;
    worksCount: number;
    citedByCount: number;
    affiliations: Array<{ institution: string; countryCode?: string }>;
    recentWorks: Array<{
      title: string;
      year: number;
      venue?: string;
      doi?: string;
    }>;
  }>>([]);
  const [authorSearchLoading, setAuthorSearchLoading] = useState(false);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [handleLookupLoading, setHandleLookupLoading] = useState(false);
  const [resolvedProfile, setResolvedProfile] = useState<{ handle: string; did: string; displayName: string | null } | null>(null);
  
  // Manual entry (when no OpenAlex match)
  const [manualOrcid, setManualOrcid] = useState('');
  const [manualOpenAlexId, setManualOpenAlexId] = useState('');
  const [manualWebsite, setManualWebsite] = useState('');
  
  // Quick verify org state
  const [showQuickVerifyOrg, setShowQuickVerifyOrg] = useState(false);
  const [quickVerifyOrgHandle, setQuickVerifyOrgHandle] = useState('');
  const [quickVerifyOrgType, setQuickVerifyOrgType] = useState<'VENUE' | 'LAB' | 'ACADEMIC_INSTITUTION' | 'INDUSTRY_INSTITUTION'>('VENUE');
  const [quickVerifyOrgName, setQuickVerifyOrgName] = useState('');
  const [quickVerifyOrgLoading, setQuickVerifyOrgLoading] = useState(false);
  const [quickVerifyOrgSuccess, setQuickVerifyOrgSuccess] = useState<string | null>(null);

  // Bulk verify state
  const [showBulkVerify, setShowBulkVerify] = useState(false);
  const [bulkVerifyCsv, setBulkVerifyCsv] = useState('');
  const [bulkVerifyLoading, setBulkVerifyLoading] = useState(false);
  const [bulkVerifyResults, setBulkVerifyResults] = useState<{
    summary: { total: number; success: number; skipped: number; errors: number };
    results: Array<{
      blueskyHandle: string;
      orcidId: string;
      status: 'success' | 'skipped' | 'error';
      message: string;
      displayName?: string;
    }>;
  } | null>(null);

  // Label management state
  const [showLabelManagement, setShowLabelManagement] = useState(false);
  const [labels, setLabels] = useState<LabelDefinition[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelDefinition | null>(null);
  const [labelForm, setLabelForm] = useState<{
    identifier: string;
    severity: 'inform' | 'alert' | 'none';
    blurs: 'content' | 'media' | 'none';
    defaultSetting: 'ignore' | 'warn' | 'hide';
    adultOnly: boolean;
    name: string;
    description: string;
  }>({
    identifier: '',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    name: '',
    description: '',
  });
  const [showDeleteLabelModal, setShowDeleteLabelModal] = useState<LabelDefinition | null>(null);
  const [deleteConfirmIdentifier, setDeleteConfirmIdentifier] = useState('');
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState('');
  const [labelUsageCount, setLabelUsageCount] = useState<number | null>(null);
  
  // Ozone sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('lea-admin-key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch stats when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated]);

  // Debounced OpenAlex author search
  useEffect(() => {
    if (!authorSearchQuery || authorSearchQuery.length < 2) {
      setAuthorSearchResults([]);
      setShowAuthorDropdown(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setAuthorSearchLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/admin/openalex-search?q=${encodeURIComponent(authorSearchQuery)}`,
          { headers: { 'X-API-Key': apiKey } }
        );
        if (res.ok) {
          const data = await res.json();
          setAuthorSearchResults(data.results || []);
          setShowAuthorDropdown(true);
        }
      } catch (err) {
        console.error('OpenAlex search error:', err);
      } finally {
        setAuthorSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [authorSearchQuery, apiKey]);

  // Auto-lookup display name when handle changes
  useEffect(() => {
    if (!quickVerifyHandle || quickVerifyHandle.length < 3) {
      setResolvedProfile(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setHandleLookupLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/resolve-handle?handle=${encodeURIComponent(quickVerifyHandle)}`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
          const data = await res.json();
          setResolvedProfile(data);
          if (data.displayName && !quickVerifyNameOverride && !authorSearchQuery) {
            setAuthorSearchQuery(data.displayName);
          }
        } else {
          setResolvedProfile(null);
        }
      } catch (err) {
        console.error('Handle lookup error:', err);
        setResolvedProfile(null);
      } finally {
        setHandleLookupLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [quickVerifyHandle, apiKey]);

  useEffect(() => {
    if (quickVerifyNameOverride && quickVerifyNameOverride.length >= 2) {
      setAuthorSearchQuery(quickVerifyNameOverride);
    }
  }, [quickVerifyNameOverride]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(event.target as Node)) {
        setShowAuthorDropdown(false);
      }
    };

    if (showAuthorDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAuthorDropdown]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('lea-admin-key', apiKey);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('lea-admin-key');
    setApiKey('');
    setIsAuthenticated(false);
    setStats(null);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        setStats(await res.json());
      } else if (res.status === 401) {
        setError('Invalid API key');
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const selectAuthorResult = async (result: typeof authorSearchResults[0]) => {
    if (!quickVerifyHandle) return;
    
    setQuickVerifyLoading(true);
    setShowAuthorDropdown(false);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-verify`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueskyHandle: quickVerifyHandle,
          openAlexId: result.openAlexId,
          orcidId: result.orcid || undefined,
          displayName: result.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify');
      }
      setQuickVerifySuccess(`✓ Verified ${data.member.name} (@${data.member.handle})`);
      resetQuickVerifyState();
      fetchStats();
      setTimeout(() => setQuickVerifySuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify researcher');
    } finally {
      setQuickVerifyLoading(false);
    }
  };

  const resetQuickVerifyState = () => {
    setQuickVerifyHandle('');
    setQuickVerifyNameOverride('');
    setAuthorSearchQuery('');
    setAuthorSearchResults([]);
    setManualOrcid('');
    setManualOpenAlexId('');
    setManualWebsite('');
    setResolvedProfile(null);
  };

  const handleQuickVerify = async () => {
    if (!quickVerifyHandle) return;
    if (!manualOrcid.trim() && !manualOpenAlexId.trim() && !manualWebsite.trim()) {
      setError('At least one of ORCID, OpenAlex ID, or Website URL is required');
      return;
    }
    
    setQuickVerifyLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-verify`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueskyHandle: quickVerifyHandle,
          orcidId: manualOrcid.trim() || undefined,
          openAlexId: manualOpenAlexId.trim() || undefined,
          website: manualWebsite.trim() || undefined,
          displayName: quickVerifyNameOverride || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify');
      }
      setQuickVerifySuccess(`✓ Verified ${data.member.name} (@${data.member.handle})`);
      resetQuickVerifyState();
      fetchStats();
      setTimeout(() => setQuickVerifySuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify researcher');
    } finally {
      setQuickVerifyLoading(false);
    }
  };

  const handleQuickVerifyOrg = async () => {
    if (!quickVerifyOrgHandle) return;
    setQuickVerifyOrgLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-verify-org`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueskyHandle: quickVerifyOrgHandle,
          organizationType: quickVerifyOrgType,
          organizationName: quickVerifyOrgName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify');
      }
      setQuickVerifyOrgSuccess(`✓ Verified ${data.organization.organizationName} (@${data.organization.blueskyHandle})`);
      setQuickVerifyOrgHandle('');
      setQuickVerifyOrgName('');
      fetchStats();
      setTimeout(() => setQuickVerifyOrgSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify organization');
    } finally {
      setQuickVerifyOrgLoading(false);
    }
  };

  const parseCsvData = (csv: string): Array<{ blueskyHandle: string; orcidId: string }> => {
    const lines = csv.trim().split('\n');
    const results: Array<{ blueskyHandle: string; orcidId: string }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (i === 0 && (line.toLowerCase().includes('handle') || line.toLowerCase().includes('orcid'))) {
        continue;
      }
      
      const parts = line.split(/[,\t]/).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        results.push({
          blueskyHandle: parts[0],
          orcidId: parts[1],
        });
      }
    }
    
    return results;
  };

  const handleBulkVerify = async () => {
    const researchers = parseCsvData(bulkVerifyCsv);
    
    if (researchers.length === 0) {
      setError('No valid rows found in CSV. Expected format: blueskyHandle,orcidId');
      return;
    }
    
    if (researchers.length > 100) {
      setError('Maximum 100 researchers per batch');
      return;
    }
    
    setBulkVerifyLoading(true);
    setBulkVerifyResults(null);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/admin/bulk-verify`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ researchers }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to bulk verify');
      }
      setBulkVerifyResults(data);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk verify');
    } finally {
      setBulkVerifyLoading(false);
    }
  };

  const handleSyncFromOzone = async () => {
    if (!confirm('This will import all labeled accounts from Ozone that are not in the database. Continue?')) {
      return;
    }
    setSyncLoading(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/sync-from-ozone`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync');
      }
      setSyncResult(data);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync from Ozone');
    } finally {
      setSyncLoading(false);
    }
  };

  // Label management functions
  const fetchLabels = async () => {
    setLabelsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/labels`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setLabels(data.labels || []);
      }
    } catch (err) {
      console.error('Failed to fetch labels:', err);
    } finally {
      setLabelsLoading(false);
    }
  };

  const openAddLabelModal = () => {
    setEditingLabel(null);
    setLabelForm({
      identifier: '',
      severity: 'inform',
      blurs: 'none',
      defaultSetting: 'warn',
      adultOnly: false,
      name: '',
      description: '',
    });
    setShowLabelModal(true);
  };

  const openEditLabelModal = (label: LabelDefinition) => {
    setEditingLabel(label);
    setLabelForm({
      identifier: label.identifier,
      severity: label.severity,
      blurs: label.blurs,
      defaultSetting: label.defaultSetting,
      adultOnly: label.adultOnly,
      name: label.locales[0]?.name || '',
      description: label.locales[0]?.description || '',
    });
    setShowLabelModal(true);
  };

  const handleSaveLabel = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const labelData = {
        identifier: labelForm.identifier,
        severity: labelForm.severity,
        blurs: labelForm.blurs,
        defaultSetting: labelForm.defaultSetting,
        adultOnly: labelForm.adultOnly,
        locales: [{
          lang: 'en',
          name: labelForm.name,
          description: labelForm.description,
        }],
      };

      const url = editingLabel
        ? `${API_URL}/api/admin/labels/${editingLabel.identifier}`
        : `${API_URL}/api/admin/labels`;
      const method = editingLabel ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(labelData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save label');
      }

      await fetchLabels();
      setShowLabelModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save label');
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteLabelModal = async (label: LabelDefinition) => {
    setShowDeleteLabelModal(label);
    setDeleteConfirmIdentifier('');
    setDeleteConfirmPhrase('');
    setLabelUsageCount(null);

    try {
      const res = await fetch(`${API_URL}/api/admin/labels/${label.identifier}/usage`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setLabelUsageCount(data.usageCount);
      }
    } catch (err) {
      console.error('Failed to fetch label usage:', err);
    }
  };

  const handleDeleteLabel = async () => {
    if (!showDeleteLabelModal) return;
    if (deleteConfirmIdentifier !== showDeleteLabelModal.identifier) {
      setError('Label identifier does not match');
      return;
    }
    if (deleteConfirmPhrase !== 'DELETE THIS LABEL') {
      setError('Confirmation phrase does not match');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/labels/${showDeleteLabelModal.identifier}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmIdentifier: deleteConfirmIdentifier,
          confirmPhrase: deleteConfirmPhrase,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete label');
      }

      await fetchLabels();
      setShowDeleteLabelModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete label');
    } finally {
      setActionLoading(false);
    }
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-6">Lea Admin</h1>
          <form onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
              placeholder="Enter admin API key"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-blue-600 hover:text-blue-700">← Back</Link>
            <h1 className="text-xl font-bold">Lea Admin</h1>
          </div>
          <button onClick={handleLogout} className="text-gray-600 hover:text-gray-800">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500">×</button>
          </div>
        )}

        {quickVerifySuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded mb-4">
            {quickVerifySuccess}
          </div>
        )}

        {quickVerifyOrgSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded mb-4">
            {quickVerifyOrgSuccess}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-blue-600">{stats.researchers}</div>
              <div className="text-gray-500">Verified Researchers</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-purple-600">{stats.organizations.total}</div>
              <div className="text-gray-500">Verified Organizations</div>
            </div>
          </div>
        )}

        {/* Quick Verify Researcher */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setShowQuickVerify(!showQuickVerify)}
            className="w-full p-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="font-semibold">Verify Researcher</h2>
              <p className="text-sm text-gray-500">Verify a researcher by Bluesky handle</p>
            </div>
            <span className="text-gray-400">{showQuickVerify ? '▼' : '▶'}</span>
          </button>
          
          {showQuickVerify && (
            <div className="p-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bluesky Handle <span className="text-red-500">*</span>
                    {handleLookupLoading && <span className="text-gray-400 text-xs ml-1">(looking up...)</span>}
                  </label>
                  <input
                    type="text"
                    value={quickVerifyHandle}
                    onChange={(e) => setQuickVerifyHandle(e.target.value)}
                    placeholder="researcher.bsky.social"
                    className="w-full border rounded px-3 py-2"
                  />
                  {resolvedProfile && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ Resolved: {resolvedProfile.displayName || resolvedProfile.handle}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name Override <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={quickVerifyNameOverride}
                    onChange={(e) => setQuickVerifyNameOverride(e.target.value)}
                    placeholder="Leave blank to use Bluesky display name"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              {/* OpenAlex Search */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search OpenAlex for Author
                  {authorSearchLoading && <span className="text-gray-400 text-xs ml-1">...</span>}
                </label>
                <div className="relative" ref={authorDropdownRef}>
                  <input
                    type="text"
                    value={authorSearchQuery}
                    onChange={(e) => setAuthorSearchQuery(e.target.value)}
                    onFocus={() => authorSearchResults.length > 0 && setShowAuthorDropdown(true)}
                    placeholder="Search by name..."
                    className="w-full border rounded px-3 py-2"
                  />
                  
                  {showAuthorDropdown && authorSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto">
                      {authorSearchResults.map((result) => (
                        <div
                          key={result.openAlexId}
                          className="px-3 py-3 hover:bg-blue-50 border-b"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-sm">{result.displayName}</div>
                            <div className="text-xs text-gray-500 ml-2 shrink-0">
                              {result.citedByCount.toLocaleString()} citations
                            </div>
                          </div>
                          
                          {result.affiliations.length > 0 && (
                            <div className="text-xs text-gray-600 mb-1">
                              {result.affiliations.slice(0, 2).map((aff, i) => (
                                <span key={i}>
                                  {i > 0 && ' • '}
                                  {aff.institution}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 mb-2">
                            {result.worksCount} works
                            {result.orcid && (
                              <span className="ml-2 text-green-600">Has ORCID</span>
                            )}
                          </div>
                          
                          {result.recentWorks.length > 0 && (
                            <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                              {result.recentWorks.slice(0, 2).map((work, i) => (
                                <div key={i} className="truncate" title={work.title}>
                                  <span className="text-gray-400">{work.year}:</span> {work.title}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-3 mt-2">
                            <a
                              href={`https://openalex.org/authors/${result.openAlexId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              OpenAlex ↗
                            </a>
                            {result.orcid && (
                              <a
                                href={`https://orcid.org/${result.orcid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                ORCID ↗
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => selectAuthorResult(result)}
                              disabled={quickVerifyLoading}
                              className="ml-auto text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                            >
                              {quickVerifyLoading ? 'Verifying...' : 'Verify'}
                            </button>
                          </div>
                        </div>
                      ))}
                      <a
                        href={`https://openalex.org/authors?search=${encodeURIComponent(authorSearchQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3 py-3 text-center text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-800 border-t"
                      >
                        Browse all results on OpenAlex ↗
                      </a>
                    </div>
                  )}
                  
                  {showAuthorDropdown && authorSearchQuery.length >= 2 && !authorSearchLoading && authorSearchResults.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500">
                      No authors found in OpenAlex
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Entry Section - Always visible */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Or enter IDs manually</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">OpenAlex ID</label>
                    <input
                      type="text"
                      value={manualOpenAlexId}
                      onChange={(e) => setManualOpenAlexId(e.target.value)}
                      placeholder="A1234567890"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ORCID</label>
                    <input
                      type="text"
                      value={manualOrcid}
                      onChange={(e) => setManualOrcid(e.target.value)}
                      placeholder="0000-0001-2345-6789"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Website URL</label>
                    <input
                      type="text"
                      value={manualWebsite}
                      onChange={(e) => setManualWebsite(e.target.value)}
                      placeholder="https://example.edu/~researcher"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">At least one identifier is required</p>
                  <button
                    onClick={handleQuickVerify}
                    disabled={quickVerifyLoading || !quickVerifyHandle || (!manualOrcid.trim() && !manualOpenAlexId.trim() && !manualWebsite.trim())}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {quickVerifyLoading ? 'Verifying...' : 'Verify Manually'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Verify Organization */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setShowQuickVerifyOrg(!showQuickVerifyOrg)}
            className="w-full p-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="font-semibold">Verify Organization</h2>
              <p className="text-sm text-gray-500">Verify a venue, lab, or institution by handle</p>
            </div>
            <span className="text-gray-400">{showQuickVerifyOrg ? '▼' : '▶'}</span>
          </button>
          
          {showQuickVerifyOrg && (
            <div className="p-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bluesky Handle
                  </label>
                  <input
                    type="text"
                    value={quickVerifyOrgHandle}
                    onChange={(e) => setQuickVerifyOrgHandle(e.target.value)}
                    placeholder="organization.bsky.social"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Type
                  </label>
                  <select
                    value={quickVerifyOrgType}
                    onChange={(e) => setQuickVerifyOrgType(e.target.value as typeof quickVerifyOrgType)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="VENUE">Venue</option>
                    <option value="LAB">Research Lab</option>
                    <option value="ACADEMIC_INSTITUTION">Academic Institution</option>
                    <option value="INDUSTRY_INSTITUTION">Industry Institution</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={quickVerifyOrgName}
                    onChange={(e) => setQuickVerifyOrgName(e.target.value)}
                    placeholder="Leave blank to use profile name"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <button
                onClick={handleQuickVerifyOrg}
                disabled={!quickVerifyOrgHandle || quickVerifyOrgLoading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {quickVerifyOrgLoading ? 'Verifying...' : 'Verify Organization'}
              </button>
            </div>
          )}
        </div>

        {/* Bulk Verify */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setShowBulkVerify(!showBulkVerify)}
            className="w-full p-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="font-semibold">Bulk Verify Researchers</h2>
              <p className="text-sm text-gray-500">Upload CSV of Bluesky handles and ORCIDs</p>
            </div>
            <span className="text-gray-400">{showBulkVerify ? '▼' : '▶'}</span>
          </button>
          
          {showBulkVerify && (
            <div className="p-4 border-t">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CSV Data
                </label>
                <textarea
                  value={bulkVerifyCsv}
                  onChange={(e) => setBulkVerifyCsv(e.target.value)}
                  placeholder={`blueskyHandle,orcidId\nresearcher.bsky.social,0000-0001-2345-6789\nanother.bsky.social,0000-0002-3456-7890`}
                  className="w-full border rounded px-3 py-2 font-mono text-sm h-40"
                />
                <p className="text-xs text-gray-500 mt-1">
                  One researcher per line. Format: blueskyHandle,orcidId (header row optional). Max 100 per batch.
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBulkVerify}
                  disabled={!bulkVerifyCsv.trim() || bulkVerifyLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkVerifyLoading ? 'Processing...' : 'Verify All'}
                </button>
                
                <label className="text-sm text-gray-600 cursor-pointer hover:text-blue-600">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setBulkVerifyCsv(event.target?.result as string || '');
                        };
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                  📁 Upload CSV file
                </label>
              </div>
              
              {bulkVerifyResults && (
                <div className="mt-4">
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-gray-100 p-3 rounded text-center">
                      <div className="text-xl font-bold">{bulkVerifyResults.summary.total}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="bg-green-100 p-3 rounded text-center">
                      <div className="text-xl font-bold text-green-700">{bulkVerifyResults.summary.success}</div>
                      <div className="text-xs text-green-600">Verified</div>
                    </div>
                    <div className="bg-yellow-100 p-3 rounded text-center">
                      <div className="text-xl font-bold text-yellow-700">{bulkVerifyResults.summary.skipped}</div>
                      <div className="text-xs text-yellow-600">Skipped</div>
                    </div>
                    <div className="bg-red-100 p-3 rounded text-center">
                      <div className="text-xl font-bold text-red-700">{bulkVerifyResults.summary.errors}</div>
                      <div className="text-xs text-red-600">Errors</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setBulkVerifyResults(null);
                      setBulkVerifyCsv('');
                    }}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Clear results
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Label Management */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => {
              setShowLabelManagement(!showLabelManagement);
              if (!showLabelManagement && labels.length === 0) {
                fetchLabels();
              }
            }}
            className="w-full p-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="font-semibold">Label Management</h2>
              <p className="text-sm text-gray-500">Configure labeler badges and definitions</p>
            </div>
            <span className="text-gray-400">{showLabelManagement ? '▼' : '▶'}</span>
          </button>
          
          {showLabelManagement && (
            <div className="p-4 border-t">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-500">
                  {labels.length} label{labels.length !== 1 ? 's' : ''} configured
                </span>
                <button
                  onClick={openAddLabelModal}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                >
                  + Add Label
                </button>
              </div>

              {labelsLoading ? (
                <div className="text-center py-4 text-gray-500">Loading labels...</div>
              ) : labels.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No labels configured</div>
              ) : (
                <div className="space-y-3">
                  {labels.map((label) => (
                    <div key={label.identifier} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{label.locales[0]?.name || label.identifier}</div>
                          <div className="text-xs text-gray-500 font-mono">{label.identifier}</div>
                          <div className="text-sm text-gray-600 mt-1">{label.locales[0]?.description}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditLabelModal(label)}
                            className="text-blue-600 hover:text-blue-700 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDeleteLabelModal(label)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sync from Ozone */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Import from Ozone</h3>
              <p className="text-sm text-gray-500">Import existing labeled accounts from Ozone</p>
            </div>
            <button
              onClick={handleSyncFromOzone}
              disabled={syncLoading}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {syncLoading ? 'Syncing...' : 'Import'}
            </button>
          </div>
          
          {syncResult && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-700">
                Found {syncResult.total} labeled accounts. Imported {syncResult.imported}, skipped {syncResult.skipped}.
              </p>
              {syncResult.errors.length > 0 && (
                <p className="text-sm text-red-600 mt-1">
                  {syncResult.errors.length} error(s)
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Label Add/Edit Modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingLabel ? 'Edit Label' : 'Add New Label'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Identifier <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={labelForm.identifier}
                  onChange={(e) => setLabelForm({ ...labelForm, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full border rounded px-3 py-2 font-mono"
                  placeholder="verified-researcher"
                  disabled={!!editingLabel}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={labelForm.name}
                  onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Verified Researcher"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={labelForm.description}
                  onChange={(e) => setLabelForm({ ...labelForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-20"
                  placeholder="This account belongs to a verified researcher."
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={labelForm.severity}
                    onChange={(e) => setLabelForm({ ...labelForm, severity: e.target.value as typeof labelForm.severity })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="inform">Inform</option>
                    <option value="alert">Alert</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Blurs</label>
                  <select
                    value={labelForm.blurs}
                    onChange={(e) => setLabelForm({ ...labelForm, blurs: e.target.value as typeof labelForm.blurs })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="none">None</option>
                    <option value="content">Content</option>
                    <option value="media">Media</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default</label>
                  <select
                    value={labelForm.defaultSetting}
                    onChange={(e) => setLabelForm({ ...labelForm, defaultSetting: e.target.value as typeof labelForm.defaultSetting })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="ignore">Ignore</option>
                    <option value="warn">Warn</option>
                    <option value="hide">Hide</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowLabelModal(false)}
                className="flex-1 border py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLabel}
                disabled={actionLoading || !labelForm.identifier || !labelForm.name || !labelForm.description}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Label Modal */}
      {showDeleteLabelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Delete Label</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are about to delete the label <strong>{showDeleteLabelModal.identifier}</strong>.
              {labelUsageCount !== null && labelUsageCount > 0 && (
                <span className="block mt-2 text-red-600">
                  This label is currently applied to {labelUsageCount} account(s).
                </span>
              )}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type the label identifier to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmIdentifier}
                  onChange={(e) => setDeleteConfirmIdentifier(e.target.value)}
                  className="w-full border rounded px-3 py-2 font-mono"
                  placeholder={showDeleteLabelModal.identifier}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type &quot;DELETE THIS LABEL&quot; to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmPhrase}
                  onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="DELETE THIS LABEL"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowDeleteLabelModal(null)}
                className="flex-1 border py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLabel}
                disabled={actionLoading || deleteConfirmIdentifier !== showDeleteLabelModal.identifier || deleteConfirmPhrase !== 'DELETE THIS LABEL'}
                className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete Label'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
