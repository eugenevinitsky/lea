'use client';

import { useState } from 'react';
import { startLogin } from '@/lib/oauth';
import NewUserGuide from './NewUserGuide';

interface LoginProps {
  onLogin: (forceOnboarding?: boolean) => void;
}

function FeatureCard({ icon, title, description, color }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white/50 dark:bg-white/5 backdrop-blur-sm">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-gray-900 dark:text-white text-sm">{title}</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function Login({ onLogin }: LoginProps) {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [showNewUserGuide, setShowNewUserGuide] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle) return;

    try {
      setLoading(true);
      setError(null);
      
      // Store forceOnboarding preference for after redirect
      if (forceOnboarding) {
        sessionStorage.setItem('lea-force-onboarding', 'true');
      }
      
      // Start OAuth flow - this will redirect to the user's PDS
      await startLogin(handle);
      // Note: startLogin redirects, so code below won't run
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  if (showNewUserGuide) {
    return <NewUserGuide onBack={() => setShowNewUserGuide(false)} />;
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Left side - Features */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 p-8 xl:p-16 flex-col justify-center">
        <div className="max-w-xl">
          {/* Logo and tagline */}
          <div className="mb-10">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Lea
            </h1>
            <p className="mt-3 text-xl text-gray-700 dark:text-gray-300">
              A calmer corner of Bluesky for researchers
            </p>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Built by researchers, for researchers. Stay connected with your academic community while maintaining your peace of mind.
            </p>
          </div>

          {/* Discovery section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Discovery</h3>
            <div className="grid grid-cols-2 gap-3">
              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="Trending Papers"
                description="Papers shared by the research community"
                color="bg-purple-100 dark:bg-purple-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                }
                title="Trending Blogs"
                description="Curated technical posts"
                color="bg-orange-100 dark:bg-orange-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                title="Co-author Discovery"
                description="Find your co-authors on Bluesky"
                color="bg-cyan-100 dark:bg-cyan-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
                title="Social Discovery"
                description="Find researchers through your network"
                color="bg-teal-100 dark:bg-teal-900/30"
              />
            </div>
          </div>

          {/* Tools section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Tools</h3>
            <div className="grid grid-cols-2 gap-3">
              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="Verified Badges"
                description="ORCID verification for researchers"
                color="bg-emerald-100 dark:bg-emerald-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                title="Rich Profiles"
                description="Showcase favorite papers and publications"
                color="bg-amber-100 dark:bg-amber-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                }
                title="Extended Posts"
                description="Long-form posts with code blocks and LaTeX"
                color="bg-blue-100 dark:bg-blue-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                }
                title="Bookmark Collections"
                description="Organize and export saved posts"
                color="bg-indigo-100 dark:bg-indigo-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                title="Protective Threadgates"
                description="Limit replies to followers or verified"
                color="bg-rose-100 dark:bg-rose-900/30"
              />

              <FeatureCard
                icon={
                  <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                }
                title="Noise Filtering"
                description="Hide high-follower accounts & more"
                color="bg-pink-100 dark:bg-pink-900/30"
              />
            </div>
          </div>

          {/* Social proof */}
          <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Built on the AT Protocol. Your data stays on Bluesky.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Lea
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              A calmer corner of Bluesky for researchers
            </p>
          </div>

          {/* Login form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Welcome
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Sign in with your Bluesky account
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* OAuth login form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Bluesky Handle
                </label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourhandle.bsky.social"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  disabled={loading}
                  autoComplete="username"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter your Bluesky handle or custom domain
                </p>
              </div>
              
              {/* Test checkbox for forcing onboarding */}
              <label className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceOnboarding}
                  onChange={(e) => setForceOnboarding(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  Show onboarding flow (testing)
                </span>
              </label>

              <button
                type="submit"
                disabled={!handle || loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Redirecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    Sign in with Bluesky
                  </>
                )}
              </button>
            </form>

            {/* New to Bluesky link */}
            <button
              onClick={() => setShowNewUserGuide(true)}
              className="flex items-center justify-center gap-2 w-full py-3 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No Bluesky account? Get started here
            </button>
          </div>

          {/* Footer info */}
          <p className="mt-6 text-center text-xs text-gray-400">
            You&apos;ll be redirected to Bluesky to sign in securely.
            <br />
            Lea never sees your password.
          </p>
        </div>
      </div>
    </div>
  );
}
