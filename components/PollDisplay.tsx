'use client';

import { useState, useEffect } from 'react';
import { getSession } from '@/lib/bluesky';

interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

interface PollData {
  id: string;
  postUri: string;
  creatorDid: string;
  question: string | null;
  options: PollOption[];
  allowMultiple: boolean;
  endsAt: string | null;
  isExpired: boolean;
  totalVotes: number;
  hasVoted: boolean;
  createdAt: string;
}

interface PollDisplayProps {
  postUri: string;
}

function formatTimeRemaining(endsAt: string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m left`;
}

export default function PollDisplay({ postUri }: PollDisplayProps) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const session = getSession();
  const voterDid = session?.did;

  useEffect(() => {
    const fetchPoll = async () => {
      try {
        const params = new URLSearchParams({ postUri });
        if (voterDid) params.append('voterDid', voterDid);

        const response = await fetch(`/api/polls?${params}`);
        if (response.status === 404) {
          // No poll for this post
          setLoading(false);
          return;
        }
        if (!response.ok) throw new Error('Failed to fetch poll');

        const data = await response.json();
        setPoll(data);
      } catch (err) {
        console.error('Error fetching poll:', err);
        setError('Failed to load poll');
      } finally {
        setLoading(false);
      }
    };

    fetchPoll();
  }, [postUri, voterDid]);

  const toggleOption = (optionId: string) => {
    if (!poll || poll.hasVoted || poll.isExpired) return;

    if (poll.allowMultiple) {
      // Toggle selection for multiple choice
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      // Single choice - replace selection
      setSelectedOptions([optionId]);
    }
  };

  const submitVote = async () => {
    if (!poll || !voterDid || voting || poll.hasVoted || poll.isExpired || selectedOptions.length === 0) return;

    setVoting(true);
    setError(null);

    try {
      const response = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote',
          pollId: poll.id,
          voterDid,
          optionIds: selectedOptions,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to vote');
      }

      // Update local state to show results
      setPoll(prev => {
        if (!prev) return prev;
        const newTotalVotes = prev.totalVotes + selectedOptions.length;
        const newOptions = prev.options.map(opt => {
          const wasSelected = selectedOptions.includes(opt.id);
          const newVotes = wasSelected ? opt.votes + 1 : opt.votes;
          return {
            ...opt,
            votes: newVotes,
            percentage: newTotalVotes > 0 ? Math.round((newVotes / newTotalVotes) * 100) : 0,
          };
        });
        return {
          ...prev,
          hasVoted: true,
          totalVotes: newTotalVotes,
          options: newOptions,
        };
      });
    } catch (err) {
      console.error('Vote error:', err);
      setError(err instanceof Error ? err.message : 'Failed to vote');
    } finally {
      setVoting(false);
    }
  };

  if (loading) return null;
  if (!poll) return null;

  const showResults = poll.hasVoted || poll.isExpired;
  const canVote = voterDid && !poll.hasVoted && !poll.isExpired;

  return (
    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
      {poll.question && (
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          {poll.question}
        </p>
      )}

      <div className="space-y-2">
        {poll.options.map((option) => {
          const isSelected = selectedOptions.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={(e) => {
                e.stopPropagation();
                toggleOption(option.id);
              }}
              disabled={!canVote || voting}
              className={`w-full relative overflow-hidden rounded-lg border transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : canVote
                    ? 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    : 'border-gray-200 dark:border-gray-700'
              } ${!canVote ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {/* Progress bar background - only show after voting */}
              {showResults && (
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300 bg-gray-200 dark:bg-gray-700/50"
                  style={{ width: `${option.percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between px-3 py-2">
                <span className={`text-sm ${
                  isSelected
                    ? 'text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {option.text}
                  {isSelected && !showResults && (
                    <svg className="inline-block w-4 h-4 ml-1.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                {showResults && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {option.percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vote button - only show if can vote and has selection */}
      {canVote && selectedOptions.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            submitVote();
          }}
          disabled={voting}
          className="mt-3 w-full py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {voting ? 'Voting...' : 'Vote'}
        </button>
      )}

      {/* Poll metadata */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {poll.allowMultiple && !showResults && (
            <span className="text-gray-400">Select multiple</span>
          )}
          {poll.hasVoted && (
            <span className="text-green-500">Voted</span>
          )}
          {poll.endsAt && (
            <span>{formatTimeRemaining(poll.endsAt)}</span>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
