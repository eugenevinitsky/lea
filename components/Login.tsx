'use client';

import { useState } from 'react';
import { login } from '@/lib/bluesky';

interface LoginProps {
  onLogin: () => void;
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
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;

    try {
      setLoading(true);
      setError(null);
      await login(identifier, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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

          {/* Features grid */}
          <div className="grid gap-3">
            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Paper Skygest"
              description="A curated feed of preprints and papers shared by the research community"
              color="bg-purple-100 dark:bg-purple-900/30"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Verified Researcher Badges"
              description="Verify your identity with ORCID and get recognized in the community"
              color="bg-emerald-100 dark:bg-emerald-900/30"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
              title="Protective Threadgates"
              description="Limit replies to followers or verified researchers by default"
              color="bg-blue-100 dark:bg-blue-900/30"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              title="For You Feed"
              description="Personalized recommendations with show more/less controls"
              color="bg-orange-100 dark:bg-orange-900/30"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              }
              title="Bookmarks"
              description="Save posts for later and access them from your sidebar"
              color="bg-indigo-100 dark:bg-indigo-900/30"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              }
              title="High-Follower Filtering"
              description="Optionally hide posts from accounts following many users"
              color="bg-rose-100 dark:bg-rose-900/30"
            />
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Handle or Email
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="yourhandle.bsky.social"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  App Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Create an app password at{' '}
                  <a
                    href="https://bsky.app/settings/app-passwords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    bsky.app/settings
                  </a>
                </p>
              </div>

              <button
                type="submit"
                disabled={!identifier || !password || loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 disabled:shadow-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400">New to research verification?</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Get verified link */}
            <a
              href="https://lea-verify.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 border-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Get verified as a researcher
            </a>
          </div>

          {/* Footer info */}
          <p className="mt-6 text-center text-xs text-gray-400">
            Your credentials are sent directly to Bluesky.
            <br />
            Lea never stores your password.
          </p>
        </div>
      </div>
    </div>
  );
}
