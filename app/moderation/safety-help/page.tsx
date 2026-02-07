'use client';

import Link from 'next/link';

export default function SafetyHelpPage() {
  return (
    <>
      {/* Header with back button */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            title="Back"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Safety & Harassment Help</h2>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Intro */}
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-rose-800 dark:text-rose-200 mb-1">If you&apos;re being harassed</h3>
              <p className="text-sm text-rose-700 dark:text-rose-300">
                Lea has several safety features to help you protect yourself. This guide will walk you through your options.
              </p>
            </div>
          </div>
        </div>

        {/* Immediate Actions */}
        <section>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold">1</span>
            Immediate Actions
          </h3>
          
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Block the account
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Blocking prevents someone from seeing your posts and interacting with you. On any profile, click the menu (•••) and select &quot;Block Account&quot;. When you block someone on Lea/Bluesky, your block is <i>total</i>: no one will be able to see any of your interactions any more (for example, any replies they left on your posts will disappear), and neither of you will be able to interact in the future.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                <strong>Tip:</strong> You can manage all your blocks from <Link href="/moderation/blocked" className="text-blue-500 hover:underline">Block Management</Link>.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Block multiple accounts (pile-on)
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                If you&apos;re facing a pile-on, you can block everyone who liked or reposted a specific post all at once. Go to <Link href="/moderation/blocked" className="text-blue-500 hover:underline">Block Management</Link> and expand &quot;Mass Block from Post&quot;.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                <strong>How it works:</strong> Paste the post URL, preview who will be blocked, exclude any accounts you want to keep, then execute the block.
              </p>
            </div>
          </div>
        </section>

        {/* Limit Replies */}
        <section>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold">2</span>
            Control Who Can Reply
          </h3>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Limit who can reply to your posts
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Go to <Link href="/moderation/reply-limits" className="text-blue-500 hover:underline">Reply Limits</Link> to control who can reply:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span><strong>Everyone</strong> — Anyone can reply (default)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span><strong>People I follow</strong> — Only accounts you follow can reply</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span><strong>Verified researchers</strong> — Only verified researcher accounts can reply</span>
              </li>
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
              <strong>Tip:</strong> You can apply these limits to just future posts, just past posts, or both.
            </p>
          </div>
        </section>

        {/* Quote Control */}
        <section>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">3</span>
            Control Quotes of Your Posts
          </h3>
          
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Disable quotes on new posts
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                When composing a post, look for the option to disable quotes. This prevents others from quote-posting your content. Useful if you expect a post might attract negative attention.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Detach from an existing quote
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                If someone has already quoted your post in a harassing way, you can &quot;detach&quot; your post from their quote. This removes your content from their post—they&apos;ll still have their quote, but your original content will show as &quot;removed.&quot;
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                <strong>How to:</strong> When viewing a post that quotes your content, you&apos;ll see a &quot;Detach Quote?&quot; link in the upper right corner of that post. Click it to remove your content from their quote.
              </p>
            </div>
          </div>
        </section>

        {/* Content Filtering */}
        <section>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-bold">4</span>
            Filter Your Feed
          </h3>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Use content filters and labelers
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Go to <Link href="/moderation/content-filtering" className="text-blue-500 hover:underline">Content Filtering</Link> to hide certain types of content, and <Link href="/moderation/labelers" className="text-blue-500 hover:underline">Labelers</Link> to subscribe to community moderation services that can help filter out bad actors.
            </p>
          </div>
        </section>

        {/* Final note */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Remember</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You don&apos;t owe anyone your attention or engagement. It&apos;s okay to use these tools liberally to protect your peace of mind. You can always adjust your settings later when things calm down.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
