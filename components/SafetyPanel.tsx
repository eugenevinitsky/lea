'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getPreferences,
  getLabelerInfo,
  getUserPostsForThreadgate,
  updateThreadgate,
  checkSafetyAlerts,
  dismissSafetyAlert,
  getBlockedAccounts,
  unblockUser,
  ThreadgateType,
  LabelerInfo,
  SafetyAlert,
  AlertThresholds,
  BlockedAccount,
} from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';

// Suggested labelers - can be expanded later
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

interface SafetyPanelProps {
  onOpenProfile?: (did: string) => void;
  onOpenThread?: (uri: string) => void;
  defaultExpanded?: boolean;
  embedded?: boolean;
}

export default function SafetyPanel({ onOpenProfile, onOpenThread, defaultExpanded = false, embedded = false }: SafetyPanelProps) {
  const { settings, updateSettings } = useSettings();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || embedded || settings.safetyPanelExpanded);

  // Sync expansion state with settings (for persistence across navigation)
  useEffect(() => {
    if (!embedded && !defaultExpanded) {
      setIsExpanded(settings.safetyPanelExpanded);
    }
  }, [settings.safetyPanelExpanded, embedded, defaultExpanded]);

  const handleToggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (!embedded) {
      updateSettings({ safetyPanelExpanded: newExpanded });
    }
  };
  const [labelers, setLabelers] = useState<LabelerInfo[]>([]);
  const [loadingLabelers, setLoadingLabelers] = useState(false);
  const [showSuggestedModal, setShowSuggestedModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Reply limits state
  const [replyLimit, setReplyLimit] = useState<ThreadgateType>('following');
  const [applyingTo, setApplyingTo] = useState<'future' | 'past' | 'both' | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  
  // Safety alerts state
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [lastAlertCheck, setLastAlertCheck] = useState<Date | null>(null);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  
  // Alert thresholds (stored in localStorage)
  const [alertThresholds, setAlertThresholds] = useState({
    highEngagement: 50,
    bigAccountFollowers: 20000,
    viralQuote: 25,
  });

  // Blocked accounts state
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccount[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [blocksLoaded, setBlocksLoaded] = useState(false);
  const [unblockingDid, setUnblockingDid] = useState<string | null>(null);

  // Section expansion state (alerts always expanded, others collapsed by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Track mount state for portal and load alerts on mount
  useEffect(() => {
    setMounted(true);
    // Load saved thresholds
    const savedThresholds = localStorage.getItem('lea-alert-thresholds');
    if (savedThresholds) {
      try {
        setAlertThresholds(JSON.parse(savedThresholds));
      } catch (e) {
        console.error('Failed to parse saved thresholds:', e);
      }
    }
    // Load alerts on initial mount (homepage load)
    loadAlerts();
  }, []);

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('lea-default-threadgate');
    if (saved && ['following', 'verified', 'researchers', 'open'].includes(saved)) {
      setReplyLimit(saved as ThreadgateType);
    }
  }, []);

  // Load labelers when expanded
  useEffect(() => {
    if (isExpanded && labelers.length === 0 && !loadingLabelers) {
      loadLabelers();
    }
  }, [isExpanded]);

  // Load alerts when expanded (with rate limiting - max once per 5 minutes)
  useEffect(() => {
    if (isExpanded && !loadingAlerts) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (!lastAlertCheck || lastAlertCheck < fiveMinutesAgo) {
        loadAlerts();
      }
    }
  }, [isExpanded]);

  const loadAlerts = async () => {
    setLoadingAlerts(true);
    try {
      // Load thresholds from localStorage (in case they were updated)
      const savedThresholds = localStorage.getItem('lea-alert-thresholds');
      const thresholds: AlertThresholds = savedThresholds ? JSON.parse(savedThresholds) : alertThresholds;
      
      const newAlerts = await checkSafetyAlerts(thresholds);
      setAlerts(newAlerts);
      setLastAlertCheck(new Date());
    } catch (error) {
      console.error('Failed to load safety alerts:', error);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleDismissAlert = (alertId: string) => {
    dismissSafetyAlert(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const handleSaveThresholds = (newThresholds: typeof alertThresholds) => {
    setAlertThresholds(newThresholds);
    localStorage.setItem('lea-alert-thresholds', JSON.stringify(newThresholds));
    setShowAlertSettings(false);
    // Re-check alerts with new thresholds
    loadAlerts();
  };

  const getAlertIcon = (type: SafetyAlert['type']) => {
    switch (type) {
      case 'high_engagement':
        return (
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'big_account_repost':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'big_account_quote':
        return (
          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        );
      case 'quote_going_viral':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
        );
    }
  };

  const loadLabelers = async () => {
    setLoadingLabelers(true);
    try {
      const prefs = await getPreferences();
      const labelerInfos: LabelerInfo[] = [];
      
      for (const labeler of prefs.labelers) {
        const info = await getLabelerInfo(labeler.did);
        if (info) {
          labelerInfos.push(info);
        }
      }
      
      setLabelers(labelerInfos);
    } catch (error) {
      console.error('Failed to load labelers:', error);
    } finally {
      setLoadingLabelers(false);
    }
  };

  const handleReplyLimitChange = (value: ThreadgateType) => {
    setReplyLimit(value);
    setApplyError(null);
    setApplySuccess(null);
  };

  const applyToFuture = () => {
    localStorage.setItem('lea-default-threadgate', replyLimit);
    setApplySuccess('Default reply limit saved for future posts');
    setTimeout(() => setApplySuccess(null), 3000);
  };

  const applyToPast = async () => {
    setApplyingTo('past');
    setApplyError(null);
    setApplySuccess(null);
    setProgress({ current: 0, total: 0 });

    try {
      // First, gather all posts
      const allPosts: Array<{ uri: string; cid: string }> = [];
      let cursor: string | undefined;
      
      do {
        const result = await getUserPostsForThreadgate(cursor, 100);
        allPosts.push(...result.posts);
        cursor = result.cursor;
        setProgress({ current: 0, total: allPosts.length });
      } while (cursor);

      if (allPosts.length === 0) {
        setApplySuccess('No posts found to update');
        setApplyingTo(null);
        setProgress(null);
        return;
      }

      setProgress({ current: 0, total: allPosts.length });

      // Process in batches of 10
      const BATCH_SIZE = 10;
      let processed = 0;

      for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
        const batch = allPosts.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (post) => {
            try {
              await updateThreadgate(post.uri, replyLimit);
            } catch (error) {
              console.error(`Failed to update threadgate for ${post.uri}:`, error);
            }
          })
        );
        
        processed += batch.length;
        setProgress({ current: processed, total: allPosts.length });
        
        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < allPosts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setApplySuccess(`Updated reply limits on ${allPosts.length} posts`);
    } catch (error) {
      console.error('Failed to apply to past posts:', error);
      setApplyError('Failed to update past posts. Please try again.');
    } finally {
      setApplyingTo(null);
      setProgress(null);
    }
  };

  const applyToBoth = async () => {
    applyToFuture();
    await applyToPast();
  };

  const getReplyLimitLabel = (type: ThreadgateType): string => {
    switch (type) {
      case 'following': return 'People I follow';
      case 'verified': return 'Verified researchers';
      case 'researchers': return 'Verified researchers only';
      case 'open': return 'Everyone';
      default: return type;
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  return (
    <div className={`bg-white dark:bg-gray-900 overflow-hidden ${embedded ? '' : 'rounded-xl border border-gray-200 dark:border-gray-800'}`}>
      {/* Header - always visible, hidden when embedded */}
      {!embedded && <button
        onClick={handleToggleExpanded}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {/* Alert badge on icon when collapsed */}
            {!isExpanded && alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Moderation</span>
          {/* Alert count badge next to title when collapsed */}
          {!isExpanded && alerts.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>}

      {/* Expanded content */}
      {isExpanded && (
        <div className={embedded ? '' : 'border-t border-gray-200 dark:border-gray-800'}>
          {/* Quick Help Link */}
          <a
            href="/settings/safety-help"
            className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors border-b border-gray-200 dark:border-gray-800"
          >
            <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-xs font-medium text-rose-700 dark:text-rose-300">Quick Help</span>
            <svg className="w-3.5 h-3.5 text-rose-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Safety Alerts Section - Always expanded */}
          <div className="bg-amber-50 dark:bg-amber-900/20">
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300">Alerts</h4>
                {alerts.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAlertSettings(true)}
                className="p-1 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                title="Alert settings"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Alerts content - always shown */}
            {(
              <div className="p-3 border-b border-gray-200 dark:border-gray-800">
                {loadingAlerts ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="py-3 text-center">
                    <svg className="w-6 h-6 mx-auto text-gray-300 dark:text-gray-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-gray-400">No alerts right now</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="relative p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg group"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-0.5">
                            {getAlertIcon(alert.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                              {alert.message}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              &ldquo;{alert.postText}&rdquo;
                            </p>
                            {alert.relatedAccount && (
                              <button
                                onClick={() => onOpenProfile?.(alert.relatedAccount!.did)}
                                className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                              >
                                {alert.relatedAccount.avatar && (
                                  <img
                                    src={alert.relatedAccount.avatar}
                                    alt=""
                                    className="w-4 h-4 rounded-full"
                                  />
                                )}
                                <span>View @{alert.relatedAccount.handle}</span>
                              </button>
                            )}
                            <button
                              onClick={() => onOpenThread?.(alert.postUri)}
                              className="mt-1 text-xs text-blue-500 hover:text-blue-600 hover:underline"
                            >
                              View post →
                            </button>
                          </div>
                          <button
                            onClick={() => handleDismissAlert(alert.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
                            title="Dismiss"
                          >
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Refresh button */}
                <button
                  onClick={loadAlerts}
                  disabled={loadingAlerts}
                  className="w-full mt-3 py-1.5 px-3 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <svg className={`w-3 h-3 ${loadingAlerts ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loadingAlerts ? 'Checking...' : 'Check for alerts'}
                </button>
              </div>
            )}
          </div>

          {/* Reply Limits Link */}
          <a
            href="/settings/reply-limits"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Reply Limits</span>
            <svg className="w-3.5 h-3.5 text-blue-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Content Filtering Link */}
          <a
            href="/settings/content-filtering"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Content Filtering</span>
            <svg className="w-3.5 h-3.5 text-emerald-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Block Management Link */}
          <a
            href="/settings/blocked"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-xs font-medium text-red-700 dark:text-red-300">Block Management</span>
            <svg className="w-3.5 h-3.5 text-red-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Display Link */}
          <a
            href="/settings/display"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Display</span>
            <svg className="w-3.5 h-3.5 text-purple-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Labelers Link */}
          <a
            href="/settings/labelers"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Labelers</span>
            <svg className="w-3.5 h-3.5 text-orange-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      )}

      {/* Alert Settings Modal */}
      {showAlertSettings && mounted && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, isolation: 'isolate' }}
          onClick={() => setShowAlertSettings(false)}
        >
          <div className="absolute inset-0 bg-black/50" style={{ zIndex: -1 }} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Alert Settings</h3>
              <button
                onClick={() => setShowAlertSettings(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Adjust when you receive alerts about your posts.
              </p>
              
              {/* High engagement threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  High engagement alert
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Alert when a post gets this many interactions (likes + reposts + replies)
                </p>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="10"
                  defaultValue={alertThresholds.highEngagement}
                  onChange={(e) => setAlertThresholds(prev => ({ ...prev, highEngagement: parseInt(e.target.value) || 50 }))}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Big account threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Big account alert
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Alert when someone with at least this many followers reposts or quotes you
                </p>
                <input
                  type="number"
                  min="1000"
                  max="1000000"
                  step="1000"
                  defaultValue={alertThresholds.bigAccountFollowers}
                  onChange={(e) => setAlertThresholds(prev => ({ ...prev, bigAccountFollowers: parseInt(e.target.value) || 20000 }))}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Viral quote threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Viral quote alert
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Alert when a quote of your post gets this many interactions
                </p>
                <input
                  type="number"
                  min="5"
                  max="500"
                  step="5"
                  defaultValue={alertThresholds.viralQuote}
                  onChange={(e) => setAlertThresholds(prev => ({ ...prev, viralQuote: parseInt(e.target.value) || 25 }))}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <button
                onClick={() => handleSaveThresholds(alertThresholds)}
                className="w-full py-2 px-3 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Suggested Labelers Modal */}
      {showSuggestedModal && mounted && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, isolation: 'isolate' }}
          onClick={() => setShowSuggestedModal(false)}
        >
          <div className="absolute inset-0 bg-black/50" style={{ zIndex: -1 }} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Suggested Labelers</h3>
              <button
                onClick={() => setShowSuggestedModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Labelers help identify content and accounts. You can subscribe to labelers on Bluesky to see their labels in Lea.
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
        </div>,
        document.body
      )}
    </div>
  );
}
