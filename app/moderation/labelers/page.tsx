'use client';

import { useState, useEffect } from 'react';
import { getPreferences, getLabelerInfo, LabelerInfo } from '@/lib/bluesky';

// Suggested labelers
const SUGGESTED_LABELERS = [
  {
    did: 'did:plc:saslbwamakedc4h6c5bmshvz',
    handle: 'labeler.hailey.at',
    displayName: "Hailey's Labeler",
    description: 'A labeler by @hailey.at. Labels are not absolute judgements, but rather information about the type of account or content you may be interacting with.',
  },
  {
    did: 'did:plc:e4elbtctnfqocyfcml6h2lf7',
    handle: 'skywatch.blue',
    displayName: 'Skywatch Blue / Anti-Alf Aktion',
    description: 'Ceaseless watcher, turn your gaze upon this wretched thing. Independent Labeling Service.',
  },
  {
    did: 'did:plc:d2mkddsbmnrgr3domzg5qexf',
    handle: 'moderation.blacksky.app',
    displayName: 'Blacksky Moderation',
    description: 'Building the intercommunal net where communities can use decentralized tools to govern themselves, pool resources, and stay safe on their own terms.',
  },
  {
    did: 'did:plc:oubsyca6hhgqhmbbk27lvs7c',
    handle: 'stechlab-labels.bsky.social',
    displayName: 'STech Lab Labels',
    description: 'A research project from Cornell Tech, investigating using automated signals to help users have more context about the accounts they are interacting with.',
  },
];

export default function LabelersPage() {
  const [labelers, setLabelers] = useState<LabelerInfo[]>([]);
  const [loadingLabelers, setLoadingLabelers] = useState(false);

  useEffect(() => {
    loadLabelers();
  }, []);

  const loadLabelers = async () => {
    setLoadingLabelers(true);
    try {
      const prefs = await getPreferences();
      const labelerInfos: LabelerInfo[] = [];
      
      for (const labeler of prefs.labelers) {
        try {
          const info = await getLabelerInfo(labeler.did);
          if (info) {
            labelerInfos.push(info);
          }
        } catch (err) {
          console.error(`Failed to load labeler ${labeler.did}:`, err);
        }
      }
      
      setLabelers(labelerInfos);
    } catch (err) {
      console.error('Failed to load labelers:', err);
    } finally {
      setLoadingLabelers(false);
    }
  };

  return (
    <>
      {/* Header with back button */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-3 mb-3">
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Labelers</h2>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Labelers help identify content and accounts. You can subscribe to labelers on Bluesky to see their labels in Lea.
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Subscribed labelers */}
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Your subscribed labelers</h3>
          
          {loadingLabelers ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : labelers.length === 0 ? (
            <div className="text-center py-8 px-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <p className="text-sm text-gray-500">No labelers subscribed</p>
              <p className="text-xs text-gray-400 mt-1">Subscribe to labelers on Bluesky to see them here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {labelers.map((labeler) => (
                <a
                  key={labeler.did}
                  href={`https://bsky.app/profile/${labeler.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {labeler.avatar ? (
                    <img
                      src={labeler.avatar}
                      alt={labeler.displayName || labeler.handle}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                      {(labeler.displayName || labeler.handle)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {labeler.displayName || labeler.handle}
                    </p>
                    <p className="text-sm text-gray-500 truncate">@{labeler.handle}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={loadLabelers}
          disabled={loadingLabelers}
          className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className={`w-4 h-4 ${loadingLabelers ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loadingLabelers ? 'Refreshing...' : 'Refresh list'}
        </button>

        {/* Discover more labelers section */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Discover more labelers</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Subscribe to these labelers on Bluesky to see their labels in Lea.
          </p>
          <div className="space-y-3">
            {SUGGESTED_LABELERS.map((labeler) => (
              <a
                key={labeler.did}
                href={`https://bsky.app/profile/${labeler.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    {labeler.displayName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{labeler.displayName}</p>
                    <p className="text-sm text-gray-500">@{labeler.handle}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{labeler.description}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-blue-500">
                  <span>View on Bluesky</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
