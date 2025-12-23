'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getAuthorByOrcid, getAuthorWorks, OpenAlexAuthor, OpenAlexWork } from '@/lib/openalex';
import { checkVerificationEligibility, VerificationResult, ESTABLISHED_VENUES } from '@/lib/verification';

type VerificationStep = 'input' | 'loading' | 'result';

export default function VerifyPage() {
  const [step, setStep] = useState<VerificationStep>('input');
  const [orcid, setOrcid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState<OpenAlexAuthor | null>(null);
  const [works, setWorks] = useState<OpenAlexWork[]>([]);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orcid.trim()) return;

    setStep('loading');
    setError(null);

    try {
      // Fetch author from OpenAlex
      const authorData = await getAuthorByOrcid(orcid);

      if (!authorData) {
        setError('No author found with this ORCID. Make sure your ORCID profile is linked to OpenAlex.');
        setStep('input');
        return;
      }

      setAuthor(authorData);

      // Fetch their works
      const worksData = await getAuthorWorks(authorData.id, { perPage: 100 });
      setWorks(worksData.results);

      // Check eligibility
      const verificationResult = checkVerificationEligibility(authorData, worksData.results);
      setResult(verificationResult);

      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify. Please try again.');
      setStep('input');
    }
  };

  const reset = () => {
    setStep('input');
    setOrcid('');
    setAuthor(null);
    setWorks([]);
    setResult(null);
    setError(null);
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
              Check Your Eligibility
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Enter your ORCID to check if you qualify for auto-approval as a verified researcher.
            </p>

            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                {error}
              </div>
            )}

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
                className="w-full py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
              {result.eligible ? (
                <div className="space-y-3">
                  <p className="text-gray-600 dark:text-gray-400">
                    You're eligible for auto-approval! To complete verification:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                    <li>Connect your Bluesky account</li>
                    <li>Authenticate with ORCID (to prove ownership)</li>
                    <li>Receive your verified researcher badge</li>
                  </ol>
                  <button
                    className="mt-4 w-full py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600"
                    disabled
                  >
                    Complete Verification (Coming Soon)
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
              Check Another ORCID
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
