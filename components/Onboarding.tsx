'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFeeds, SUGGESTED_FEEDS, PinnedFeed } from '@/lib/feeds';
import { useSettings } from '@/lib/settings';
import { followUser, getSession, getMyFollows } from '@/lib/bluesky';

interface OnboardingProps {
  onComplete: () => void;
  startAtStep?: number;
}

// Predefined research topics for selection
const RESEARCH_TOPICS = [
  'Machine Learning',
  'Artificial Intelligence',
  'Computer Science',
  'Natural Language Processing',
  'Computer Vision',
  'Neuroscience',
  'Psychology',
  'Economics',
  'Political Science',
  'Sociology',
  'Physics',
  'Biology',
  'Chemistry',
  'Medicine',
  'Mathematics',
  'Statistics',
  'Environmental Science',
  'Climate Science',
  'Public Health',
  'Education',
];

interface ResearcherSuggestion {
  did: string;
  handle: string;
  name: string;
  institution: string;
  researchTopics: string[];
  matchedTopics: string[];
}

const FEED_OPTIONS = [
  {
    ...SUGGESTED_FEEDS[0], // Verified Researchers
    recommended: true,
  },
  {
    ...SUGGESTED_FEEDS[1], // Paper Skygest
    recommended: true,
  },
  {
    ...SUGGESTED_FEEDS[2], // For You
    recommended: true,
  },
  {
    uri: 'timeline',
    displayName: 'Timeline',
    description: 'Posts from people you follow',
    acceptsInteractions: false,
  },
  ...SUGGESTED_FEEDS.slice(3), // Mutuals, Quiet Posters, Academic Jobs
];

export default function Onboarding({ onComplete, startAtStep = 1 }: OnboardingProps) {
  const [step, setStep] = useState(startAtStep);
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(
    new Set([SUGGESTED_FEEDS[0].uri, SUGGESTED_FEEDS[1].uri, SUGGESTED_FEEDS[2].uri]) // Verified Researchers, Paper Skygest, For You
  );
  const { addFeed, pinnedFeeds } = useFeeds();
  const { settings, updateSettings } = useSettings();

  const [threadgateChoice, setThreadgateChoice] = useState<'open' | 'following' | 'researchers'>('open');
  const [dimNonVerified, setDimNonVerified] = useState(false);

  // Research interests state
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [allResearchers, setAllResearchers] = useState<ResearcherSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingAllResearchers, setLoadingAllResearchers] = useState(false);
  const [followedDids, setFollowedDids] = useState<Set<string>>(new Set());
  const [followingDid, setFollowingDid] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState<'all' | 'topics' | 'individual'>('topics');
  const [bulkFollowing, setBulkFollowing] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  // Topic search state
  const [topicSearch, setTopicSearch] = useState('');
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);

  // Compute all available topics (predefined + from researchers)
  const allAvailableTopics = useMemo(() => {
    const topicsSet = new Set(RESEARCH_TOPICS);
    for (const researcher of allResearchers) {
      if (researcher.researchTopics) {
        for (const topic of researcher.researchTopics) {
          topicsSet.add(topic);
        }
      }
    }
    return Array.from(topicsSet).sort();
  }, [allResearchers]);

  // Filter topics based on search
  const filteredTopicSuggestions = useMemo(() => {
    if (!topicSearch.trim()) return [];
    const search = topicSearch.toLowerCase();
    return allAvailableTopics
      .filter(topic =>
        topic.toLowerCase().includes(search) && !selectedTopics.has(topic)
      )
      .slice(0, 10);
  }, [topicSearch, allAvailableTopics, selectedTopics]);

  const addTopic = (topic: string) => {
    setSelectedTopics(prev => new Set(prev).add(topic));
    setTopicSearch('');
    setShowTopicSuggestions(false);
  };

  // Fetch researchers data
  const fetchResearchersData = async () => {
    if (loadingAllResearchers) return; // Prevent duplicate fetches
    setLoadingAllResearchers(true);
    try {
      // Fetch existing follows first
      const existingFollows = await getMyFollows();
      setFollowedDids(existingFollows);

      const session = getSession();
      const response = await fetch('/api/researchers');
      const data = await response.json();
      if (data.researchers) {
        const mapped = data.researchers
          .filter((r: { did: string }) => r.did !== session?.did)
          .map((r: { did: string; handle: string; name: string; institution: string; researchTopics: string | null }) => ({
            did: r.did,
            handle: r.handle,
            name: r.name,
            institution: r.institution,
            researchTopics: r.researchTopics ? JSON.parse(r.researchTopics) : [],
            matchedTopics: [],
          }));
        setAllResearchers(mapped);
        // Initialize only non-followed researchers as selected for bulk follow
        setSelectedForBulk(new Set(
          mapped
            .filter((r: ResearcherSuggestion) => !existingFollows.has(r.did))
            .map((r: ResearcherSuggestion) => r.did)
        ));
      }
    } catch (error) {
      console.error('Failed to fetch researchers:', error);
    } finally {
      setLoadingAllResearchers(false);
    }
  };

  // Fetch on mount if starting at step 3
  useEffect(() => {
    if (startAtStep >= 3) {
      fetchResearchersData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch when navigating to step 3 during normal flow
  useEffect(() => {
    if (step === 3 && allResearchers.length === 0 && startAtStep < 3) {
      fetchResearchersData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Fetch suggestions when topics change
  useEffect(() => {
    if (selectedTopics.size === 0) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const session = getSession();
        const response = await fetch('/api/researchers/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topics: Array.from(selectedTopics),
            excludeDid: session?.did,
            limit: 20,
          }),
        });
        const data = await response.json();
        if (data.suggestions) {
          setSuggestions(data.suggestions);
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [selectedTopics]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  };

  const handleFollow = async (did: string) => {
    setFollowingDid(did);
    try {
      await followUser(did);
      setFollowedDids(prev => new Set(prev).add(did));
    } catch (error) {
      console.error('Failed to follow:', error);
    } finally {
      setFollowingDid(null);
    }
  };

  const handleBulkFollow = async (researchers: ResearcherSuggestion[]) => {
    setBulkFollowing(true);
    const toFollow = researchers.filter(r => !followedDids.has(r.did));
    for (const researcher of toFollow) {
      try {
        await followUser(researcher.did);
        setFollowedDids(prev => new Set(prev).add(researcher.did));
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to follow ${researcher.handle}:`, error);
      }
    }
    setBulkFollowing(false);
  };

  const toggleBulkSelection = (did: string) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      if (next.has(did)) {
        next.delete(did);
      } else {
        next.add(did);
      }
      return next;
    });
  };

  const selectAllForBulk = () => {
    setSelectedForBulk(new Set(allResearchers.map(r => r.did)));
  };

  const deselectAllForBulk = () => {
    setSelectedForBulk(new Set());
  };

  const getResearchersToShow = () => {
    if (followMode === 'all') {
      return allResearchers;
    } else if (followMode === 'topics') {
      return suggestions;
    }
    return followMode === 'individual' ? (selectedTopics.size > 0 ? suggestions : allResearchers) : [];
  };

  const toggleFeed = (uri: string) => {
    setSelectedFeeds(prev => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  };

  const handleFinish = () => {
    // Clear existing feeds and add selected ones
    const feedsToAdd: PinnedFeed[] = [];

    for (const uri of selectedFeeds) {
      const feedInfo = FEED_OPTIONS.find(f => f.uri === uri);
      if (feedInfo) {
        feedsToAdd.push({
          uri: feedInfo.uri,
          displayName: feedInfo.displayName,
          acceptsInteractions: feedInfo.acceptsInteractions || false,
        });
      }
    }

    // Add feeds
    feedsToAdd.forEach(feed => {
      if (!pinnedFeeds.some(f => f.uri === feed.uri)) {
        addFeed(feed);
      }
    });

    // Update settings
    updateSettings({
      autoThreadgate: threadgateChoice !== 'open',
      threadgateType: threadgateChoice === 'open' ? 'following' : threadgateChoice,
      dimNonVerified,
    });

    // Mark onboarding as complete
    localStorage.setItem('lea-onboarding-complete', 'true');
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress indicator - only show for full onboarding flow */}
        {startAtStep === 1 && (
          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s === step ? 'bg-blue-500' : s < step ? 'bg-blue-300' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          {/* Step 1: Welcome & Feed Selection */}
          {step === 1 && (
            <div className="p-8">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Welcome to Lea
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Let's set up your feeds. You can always change these later.
                </p>
              </div>

              <div className="space-y-3">
                {FEED_OPTIONS.map(feed => (
                  <button
                    key={feed.uri}
                    onClick={() => toggleFeed(feed.uri)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      selectedFeeds.has(feed.uri)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedFeeds.has(feed.uri)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {selectedFeeds.has(feed.uri) && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {feed.displayName}
                          </span>
                          {'recommended' in feed && feed.recommended && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {feed.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={selectedFeeds.size === 0}
                className="w-full mt-6 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Reply Protection */}
          {step === 2 && (
            <div className="p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Reply Protection
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Who can reply to your posts by default?
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setThreadgateChoice('open')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    threadgateChoice === 'open'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">Everyone</div>
                  <p className="text-sm text-gray-500 mt-0.5">Anyone can reply to your posts</p>
                </button>

                <button
                  onClick={() => setThreadgateChoice('following')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    threadgateChoice === 'following'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">People you follow</span>
                    <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Only people you follow can reply</p>
                </button>

                <button
                  onClick={() => setThreadgateChoice('researchers')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    threadgateChoice === 'researchers'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">Verified researchers only</div>
                  <p className="text-sm text-gray-500 mt-0.5">Only verified researchers can reply</p>
                </button>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Find Researchers */}
          {step === 3 && (
            <div className="p-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Follow Researchers
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Connect with verified researchers in your field
                </p>
              </div>

              {/* Follow mode selection */}
              <div className="mb-6">
                <div className="space-y-2">
                  <button
                    onClick={() => setFollowMode('all')}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                      followMode === 'all'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">Follow all ({allResearchers.length})</div>
                    <p className="text-sm text-gray-500 mt-0.5">Follow every verified researcher at once</p>
                  </button>

                  <button
                    onClick={() => setFollowMode('topics')}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                      followMode === 'topics'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">By interest</span>
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">Select topics, follow matching researchers</p>
                  </button>

                  <button
                    onClick={() => setFollowMode('individual')}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                      followMode === 'individual'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">Pick individually</div>
                    <p className="text-sm text-gray-500 mt-0.5">Browse and select one by one</p>
                  </button>
                </div>
              </div>

              {/* Topic selection for 'topics' mode */}
              {followMode === 'topics' && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Select your research interests
                  </h3>

                  {/* Search input for topics */}
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={topicSearch}
                      onChange={(e) => {
                        setTopicSearch(e.target.value);
                        setShowTopicSuggestions(true);
                      }}
                      onFocus={() => setShowTopicSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowTopicSuggestions(false), 200)}
                      placeholder="Search for topics..."
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>

                    {/* Autocomplete dropdown */}
                    {showTopicSuggestions && filteredTopicSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filteredTopicSuggestions.map(topic => (
                          <button
                            key={topic}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addTopic(topic)}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 first:rounded-t-xl last:rounded-b-xl"
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected topics */}
                  {selectedTopics.size > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Array.from(selectedTopics).map(topic => (
                        <button
                          key={topic}
                          onClick={() => toggleTopic(topic)}
                          className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-500 text-white flex items-center gap-1.5 hover:bg-blue-600 transition-colors"
                        >
                          {topic}
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Suggested topics */}
                  <p className="text-xs text-gray-500 mb-2">Suggested topics:</p>
                  <div className="flex flex-wrap gap-2">
                    {RESEARCH_TOPICS.filter(t => !selectedTopics.has(t)).slice(0, 12).map(topic => (
                      <button
                        key={topic}
                        onClick={() => toggleTopic(topic)}
                        className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk follow with selectable list for 'all' mode */}
              {followMode === 'all' && (
                <div className="mb-6">
                  {loadingAllResearchers ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {selectedForBulk.size} of {allResearchers.length} selected
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={selectAllForBulk}
                            className="text-xs text-blue-500 hover:text-blue-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={deselectAllForBulk}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Deselect all
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-[250px] overflow-y-auto mb-4">
                        {allResearchers.map(researcher => (
                          <div
                            key={researcher.did}
                            onClick={() => !followedDids.has(researcher.did) && toggleBulkSelection(researcher.did)}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                              followedDids.has(researcher.did)
                                ? 'bg-gray-100 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                                : selectedForBulk.has(researcher.did)
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              followedDids.has(researcher.did)
                                ? 'border-gray-300 bg-gray-300 dark:border-gray-600 dark:bg-gray-600'
                                : selectedForBulk.has(researcher.did)
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {(selectedForBulk.has(researcher.did) || followedDids.has(researcher.did)) && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {researcher.name || researcher.handle}
                                </span>
                                <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              </div>
                              {researcher.researchTopics && researcher.researchTopics.length > 0 ? (
                                <p className="text-xs text-gray-500 truncate">
                                  {researcher.researchTopics.slice(0, 2).join(' · ')}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-500 truncate">@{researcher.handle}</p>
                              )}
                            </div>
                            {followedDids.has(researcher.did) && (
                              <span className="text-xs text-gray-400">Following</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="text-center">
                        <button
                          onClick={() => handleBulkFollow(allResearchers.filter(r => selectedForBulk.has(r.did)))}
                          disabled={bulkFollowing || selectedForBulk.size === 0 || allResearchers.filter(r => selectedForBulk.has(r.did)).every(r => followedDids.has(r.did))}
                          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                            selectedForBulk.size === 0 || allResearchers.filter(r => selectedForBulk.has(r.did)).every(r => followedDids.has(r.did))
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                              : 'bg-blue-500 hover:bg-blue-600 text-white'
                          }`}
                        >
                          {bulkFollowing ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Following...
                            </span>
                          ) : allResearchers.filter(r => selectedForBulk.has(r.did)).every(r => followedDids.has(r.did)) ? (
                            `Following all selected`
                          ) : (
                            `Follow ${selectedForBulk.size} researcher${selectedForBulk.size !== 1 ? 's' : ''}`
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Bulk follow button for 'topics' mode when topics selected */}
              {followMode === 'topics' && selectedTopics.size > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Matching researchers ({suggestions.length})
                    </h3>
                    {suggestions.length > 0 && (
                      <button
                        onClick={() => handleBulkFollow(suggestions)}
                        disabled={bulkFollowing || suggestions.every(r => followedDids.has(r.did))}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          suggestions.every(r => followedDids.has(r.did))
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {bulkFollowing ? 'Following...' : suggestions.every(r => followedDids.has(r.did)) ? 'All followed' : 'Follow all'}
                      </button>
                    )}
                  </div>
                  {loadingSuggestions ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No matching researchers found. Try selecting different topics.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {suggestions.map(researcher => (
                        <div
                          key={researcher.did}
                          className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {researcher.name || researcher.handle}
                              </span>
                              <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </div>
                            {researcher.matchedTopics.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {researcher.matchedTopics.slice(0, 3).map(topic => (
                                  <span
                                    key={topic}
                                    className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                                  >
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleFollow(researcher.did)}
                            disabled={followedDids.has(researcher.did) || followingDid === researcher.did}
                            className={`ml-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              followedDids.has(researcher.did)
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            {followedDids.has(researcher.did) ? '✓' : 'Follow'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Individual selection mode */}
              {followMode === 'individual' && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    All verified researchers
                  </h3>
                  {loadingAllResearchers ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {allResearchers.map(researcher => (
                        <div
                          key={researcher.did}
                          className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {researcher.name || researcher.handle}
                              </span>
                              <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">@{researcher.handle}</p>
                          </div>
                          <button
                            onClick={() => handleFollow(researcher.did)}
                            disabled={followedDids.has(researcher.did) || followingDid === researcher.did}
                            className={`ml-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              followedDids.has(researcher.did)
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            {followingDid === researcher.did ? '...' : followedDids.has(researcher.did) ? '✓' : 'Follow'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {followedDids.size > 0 && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 text-center mb-4">
                  Following {followedDids.size} researcher{followedDids.size !== 1 ? 's' : ''}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                {startAtStep < 3 ? (
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    onClick={onComplete}
                    className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Close
                  </button>
                )}
                <button
                  onClick={() => startAtStep >= 3 ? onComplete() : setStep(4)}
                  className="flex-1 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all"
                >
                  {startAtStep >= 3 ? 'Done' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Additional Settings */}
          {step === 4 && (
            <div className="p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Almost done!
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  A few more optional settings
                </p>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={dimNonVerified}
                    onChange={(e) => setDimNonVerified(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Highlight verified researchers
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Dim posts from non-verified accounts to focus on verified researchers
                    </p>
                  </div>
                </label>
              </div>

              <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Your setup:
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• {selectedFeeds.size} feed{selectedFeeds.size !== 1 ? 's' : ''} selected</li>
                  <li>• Replies: {threadgateChoice === 'open' ? 'Everyone' : threadgateChoice === 'following' ? 'People you follow' : 'Verified researchers only'}</li>
                  <li>• {dimNonVerified ? 'Highlighting verified researchers' : 'Showing all posts equally'}</li>
                  {followedDids.size > 0 && (
                    <li>• Following {followedDids.size} verified researcher{followedDids.size !== 1 ? 's' : ''}</li>
                  )}
                </ul>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all"
                >
                  Get started
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          You can change all of these settings anytime from the Settings menu
        </p>
      </div>
    </div>
  );
}
