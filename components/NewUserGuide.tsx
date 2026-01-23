'use client';

import { useState } from 'react';

interface NewUserGuideProps {
  onBack: () => void;
}

export default function NewUserGuide({ onBack }: NewUserGuideProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    {
      number: 1,
      title: 'What is Bluesky?',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Bluesky is a decentralized social network built on the AT Protocol. It's like Twitter/X,
            but with better controls over your experience and data.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-blue-900 dark:text-blue-100">Why researchers love it:</h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Growing academic community sharing papers and discussions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Custom feeds like Paper Skygest for research content</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Better moderation tools and reply controls</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Your data is portable - you own it</span>
              </li>
            </ul>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Lea is a specialized Bluesky client designed specifically for researchers,
            with features like verified researcher badges and academic-focused feeds.
          </p>
        </div>
      ),
    },
    {
      number: 2,
      title: 'Create a Bluesky Account',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            First, you'll need to create a free Bluesky account. This takes about 2 minutes.
          </p>

          <a
            href="https://bsky.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Open bsky.app to Sign Up
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">What you'll need:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                An email address
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                A username (your "handle")
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                A password
              </li>
            </ul>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Come back here after creating your account!
          </p>
        </div>
      ),
    },
    {
      number: 3,
      title: 'Create an App Password',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            For security, Bluesky uses "app passwords" for third-party apps like Lea.
            This keeps your main password safe.
          </p>

          <a
            href="https://bsky.app/settings/app-passwords"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Open App Passwords Settings
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
            <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Important: Enable DM access
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              When creating the app password, make sure to check <strong>"Allow access to your direct messages"</strong>
              if you want to use DMs in Lea.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Steps:</h4>
            <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                <span>Click "Add App Password"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                <span>Name it something like "Lea"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                <span>Check "Allow access to your direct messages"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center text-xs font-medium">4</span>
                <span>Copy the generated password (xxxx-xxxx-xxxx-xxxx)</span>
              </li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      number: 4,
      title: 'You\'re Ready!',
      content: (
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              All set!
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              You now have everything you need to sign in to Lea.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">To sign in, you'll need:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Your Bluesky handle (e.g., yourname.bsky.social)</li>
              <li>• The app password you just created</li>
            </ul>
          </div>

          <button
            onClick={onBack}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25"
          >
            Go to Sign In
          </button>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Lea
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Getting started guide
          </p>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((step) => (
            <button
              key={step.number}
              onClick={() => setCurrentStep(step.number)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step.number === currentStep
                  ? 'bg-blue-500 text-white'
                  : step.number < currentStep
                  ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {step.number < currentStep ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </button>
          ))}
        </div>

        {/* Content Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {currentStepData.title}
            </h2>
            {currentStepData.content}
          </div>

          {/* Navigation */}
          {currentStep < 4 && (
            <div className="px-6 pb-6 flex gap-3">
              {currentStep > 1 ? (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
              ) : (
                <button
                  onClick={onBack}
                  className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Back to Sign In
                </button>
              )}
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors"
              >
                {currentStep === 3 ? 'I\'m Ready!' : 'Next'}
              </button>
            </div>
          )}
        </div>

        {/* Skip link */}
        {currentStep < 4 && (
          <p className="text-center mt-4 text-sm text-gray-400">
            Already have an account?{' '}
            <button onClick={onBack} className="text-blue-500 hover:underline">
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
