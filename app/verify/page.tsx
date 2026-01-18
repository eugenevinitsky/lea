'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAuthorByOrcid, getAuthorWorks, OpenAlexAuthor, OpenAlexWork } from '@/lib/openalex';
import { checkVerificationEligibility, VerificationResult, ESTABLISHED_VENUES, extractResearchTopics } from '@/lib/verification';
import { getSession} from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { refreshAgent } from '@/lib/bluesky';

type VerificationStep = 'input' | 'loading' | 'result';

function VerifyContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<VerificationStep>('input');
  const [orcid, setOrcid] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedName, setAuthenticatedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState<OpenAlexAuthor | null>(null);
  const [works, setWorks] = useState<OpenAlexWork[]>([]);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [completing, setCompleting] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // Restore Bluesky session on mount
  useEffect(() => {
    initOAuth().then((result) => { refreshAgent(); const restored = !!result?.session;
      setSessionRestored(true);
      setHasSession(restored);
    });
  }, []);

  // Check for ORCID OAuth callback params
  useEffect(() => {
    const orcidParam = searchParams.get('orcid');
    const authenticated = searchParams.get('authenticated');
    const name = searchParams.get('name');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    } else if (orcidParam && authenticated === 'true') {
      setOrcid(orcidParam);
      setIsAuthenticated(true);
      if (name) setAuthenticatedName(decodeURIComponent(name));
      // Auto-fetch data for authenticated ORCID
      fetchVerificationData(orcidParam);
    }
  }, [searchParams]);

  const fetchVerificationData = async (orcidToFetch: string) => {
    setStep('loading');
    setError(null);

    try {
      const authorData = await getAuthorByOrcid(orcidToFetch);

      if (!authorData) {
        setError('No author found with this ORCID in OpenAlex. Your ORCID may not be linked to OpenAlex yet.');
        setStep('input');
        return;
      }

      setAuthor(authorData);

      const worksData = await getAuthorWorks(authorData.id, { perPage: 100 });
      setWorks(worksData.results);

      const verificationResult = checkVerificationEligibility(authorData, worksData.results);
      setResult(verificationResult);

      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify. Please try again.');
      setStep('input');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orcid.trim()) return;
    await fetchVerificationData(orcid);
  };

  const handleOrcidLogin = () => {
    // Redirect to ORCID OAuth
    window.location.href = '/api/orcid/authorize';
  };

  const completeVerification = async () => {
    const session = getSession();
    if (!session) {
      setError('Please log in to Bluesky first from the main page, then return here.');
      return;
    }

    setCompleting(true);
    setError(null);

    try {
      // Extract research topics from works
      const researchTopics = extractResearchTopics(works);

      const response = await fetch('/api/researchers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: session.did,
          handle: session.handle,
          orcid: orcid,
          name: author?.display_name || authenticatedName,
          institution: author?.last_known_institution?.display_name,
          researchTopics,
          verificationMethod: 'auto',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete verification');
      }

      // Trigger personal list sync in the background (don't await)
      fetch('/api/list/personal/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: session.did }),
      }).catch(console.error);

      setVerificationComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete verification');
    } finally {
      setCompleting(false);
    }
  };

  const reset = () => {
    setStep('input');
    setOrcid('');
    setIsAuthenticated(false);
    setAuthenticatedName('');
    setAuthor(null);
    setWorks([]);
    setResult(null);
    setError(null);
    // Clear URL params
    window.history.replaceState({}, '', '/verify');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-500">
            Lea
          </Link>
          <span className="text-sm text-gray-500">Researcher Verification</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Step: Input */}
        {step === 'input' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Verify Your Researcher Status
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Connect your ORCID to check if you qualify for auto-approval as a verified researcher.
            </p>

            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                {error}
              </div>
            )}

            {/* ORCID OAuth Button */}
            <div className="mb-6">
              <button
                onClick={handleOrcidLogin}
                className="w-full py-3 px-4 bg-[#A6CE39] hover:bg-[#96be29] text-white font-semibold rounded-full flex items-center justify-center gap-3 transition-colors"
              >
                <svg className="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 200.1H48.9V87h21.8v113.1zm-10.9-128c-7.4 0-13.4-6-13.4-13.4s6-13.4 13.4-13.4 13.4 6 13.4 13.4-6 13.4-13.4 13.4zm147.1 128h-21.8v-55c0-13.8-.5-31.6-19.3-31.6-19.3 0-22.3 15.1-22.3 30.6v56h-21.8V87h21v15.5h.3c2.9-5.5 10.1-19.3 29.3-19.3 31.3 0 34.6 20.6 34.6 47.4v69.5z"/>
                </svg>
                Sign in with ORCID
              </button>
              <p className="mt-2 text-xs text-center text-gray-500">
                Recommended: Proves you own this ORCID
              </p>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">or check eligibility only</span>
              </div>
            </div>

            {/* Manual ORCID Entry */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ORCID iD
                </label>
                <input
                  type="text"
                  value={orcid}
                  onChange={(e) => setOrcid(e.target.value)}
                  placeholder="0000-0002-1825-0097"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Find your ORCID at{' '}
                  <a href="https://orcid.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    orcid.org
                  </a>
                </p>
              </div>

              <button
                type="submit"
                disabled={!orcid.trim()}
                className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Check Eligibility
              </button>
            </form>

            {/* Criteria info */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Auto-Approval Criteria
              </h2>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>3+ publications at established academic venues</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>At least 1 publication in the last 5 years</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>Valid ORCID linked to OpenAlex</span>
                </li>
              </ul>
              <p className="mt-4 text-sm text-gray-500">
                Don't meet these criteria? You can still join through vouching from an existing member.
              </p>
            </div>
          </div>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">
              Fetching your publication data from OpenAlex...
            </p>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && author && (
          <div className="space-y-6">
            {/* Authentication status */}
            {isAuthenticated && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">ORCID Verified</p>
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    You've proven ownership of ORCID {orcid}
                  </p>
                </div>
              </div>
            )}

            {/* Result card */}
            <div className={`rounded-2xl p-6 shadow-sm ${
              result.eligible
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  result.eligible ? 'bg-emerald-500' : 'bg-amber-500'
                }`}>
                  {result.eligible ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${
                    result.eligible ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    {result.eligible ? 'Eligible for Auto-Approval!' : 'Manual Review Required'}
                  </h2>
                  <p className={`mt-1 ${
                    result.eligible ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {result.reason}
                  </p>
                </div>
              </div>
            </div>

            {/* Author info */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {author.display_name}
              </h3>

              {author.last_known_institution && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {author.last_known_institution.display_name}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {result.details.totalWorks}
                  </p>
                  <p className="text-sm text-gray-500">Total works</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {result.details.establishedVenueWorks}
                  </p>
                  <p className="text-sm text-gray-500">At established venues</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {result.details.recentWorks}
                  </p>
                  <p className="text-sm text-gray-500">Last 5 years</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {author.cited_by_count.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Citations</p>
                </div>
              </div>

              {result.details.topVenues.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Top Venues
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.details.topVenues.map((venue) => (
                      <span
                        key={venue}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                      >
                        {venue}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.details.fields.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Research Areas
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.details.fields.map((field) => (
                      <span
                        key={field}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent works */}
            {works.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Recent Publications
                </h3>
                <div className="space-y-4">
                  {works.slice(0, 5).map((work) => (
                    <div
                      key={work.id}
                      className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0"
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {work.title}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {work.primary_location?.source?.display_name || 'Unknown venue'} • {work.publication_year}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next steps */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Next Steps
              </h3>
              {verificationComplete ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xl font-bold">Verification Complete!</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">
                    You're now a verified researcher in the Lea community. Your posts can now use the "Verified Community" reply restriction.
                  </p>
                  <Link
                    href="/"
                    className="mt-4 block w-full py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 text-center"
                  >
                    Return to Feed
                  </Link>
                </div>
              ) : result.eligible && isAuthenticated ? (
                <div className="space-y-3">
                  <p className="text-gray-600 dark:text-gray-400">
                    You're verified and eligible! To complete the process:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="text-emerald-600 dark:text-emerald-400">✓ ORCID authenticated</li>
                    <li className="text-emerald-600 dark:text-emerald-400">✓ Eligibility confirmed</li>
                    <li>Complete verification to join the community</li>
                  </ol>
                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                  {sessionRestored && !hasSession && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm">
                      You need to be logged into Bluesky first.{' '}
                      <Link href="/" className="underline">Log in on the main page</Link>, then return here.
                    </div>
                  )}
                  <button
                    onClick={completeVerification}
                    disabled={completing || !sessionRestored || !hasSession}
                    className="mt-4 w-full py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!sessionRestored ? 'Loading...' : completing ? 'Completing...' : 'Complete Verification'}
                  </button>
                </div>
              ) : result.eligible ? (
                <div className="space-y-3">
                  <p className="text-gray-600 dark:text-gray-400">
                    You're eligible for auto-approval! To complete verification:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                    <li>Sign in with ORCID (to prove ownership)</li>
                    <li>Connect your Bluesky account</li>
                    <li>Receive your verified researcher badge</li>
                  </ol>
                  <button
                    onClick={handleOrcidLogin}
                    className="mt-4 w-full py-3 bg-[#A6CE39] hover:bg-[#96be29] text-white font-semibold rounded-full flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
                      <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 200.1H48.9V87h21.8v113.1zm-10.9-128c-7.4 0-13.4-6-13.4-13.4s6-13.4 13.4-13.4 13.4 6 13.4 13.4-6 13.4-13.4 13.4zm147.1 128h-21.8v-55c0-13.8-.5-31.6-19.3-31.6-19.3 0-22.3 15.1-22.3 30.6v56h-21.8V87h21v15.5h.3c2.9-5.5 10.1-19.3 29.3-19.3 31.3 0 34.6 20.6 34.6 47.4v69.5z"/>
                    </svg>
                    Sign in with ORCID to Continue
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-600 dark:text-gray-400">
                    You can still join Lea through:
                  </p>
                  <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      <span><strong>Vouching:</strong> Get vouched by an existing verified member</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      <span><strong>Manual review:</strong> Request review of your researcher status</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Try again */}
            <button
              onClick={reset}
              className="w-full py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-full hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Start Over
            </button>
          </div>
        )}

        {/* Venue list (collapsible) */}
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            View established venues list
          </summary>
          <div className="mt-4 bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
            {Object.entries(ESTABLISHED_VENUES).map(([category, venues]) => (
              <div key={category} className="mb-4 last:mb-0">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{category}</h4>
                <p className="text-sm text-gray-500">
                  {venues.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </details>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
