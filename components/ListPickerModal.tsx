'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getMyLists,
  getListMembershipsForUser,
  addToList,
  removeFromList,
  ListView,
} from '@/lib/bluesky';

interface ListPickerModalProps {
  targetDid: string;
  targetHandle?: string;
  targetDisplayName?: string;
  onClose: () => void;
}

interface ListWithMembership extends ListView {
  listItemUri?: string; // If user is already in this list
  isSelected: boolean;
  loading: boolean;
}

export default function ListPickerModal({
  targetDid,
  targetHandle,
  targetDisplayName,
  onClose,
}: ListPickerModalProps) {
  const [lists, setLists] = useState<ListWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch lists and memberships on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get all user's lists
        const myLists = await getMyLists();

        // Get which lists this target user is already in
        const memberships = await getListMembershipsForUser(targetDid);

        // Combine into state
        const listsWithMembership: ListWithMembership[] = myLists.map((list) => ({
          ...list,
          listItemUri: memberships.get(list.uri),
          isSelected: !!memberships.get(list.uri),
          loading: false,
        }));

        setLists(listsWithMembership);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lists');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [targetDid]);

  // Toggle list membership
  const handleToggle = async (listUri: string) => {
    const listIndex = lists.findIndex((l) => l.uri === listUri);
    if (listIndex === -1) return;

    const list = lists[listIndex];
    if (list.loading) return;

    // Set loading state
    setLists((prev) =>
      prev.map((l) => (l.uri === listUri ? { ...l, loading: true } : l))
    );

    try {
      if (list.isSelected && list.listItemUri) {
        // Remove from list
        await removeFromList(list.listItemUri);
        setLists((prev) =>
          prev.map((l) =>
            l.uri === listUri
              ? { ...l, isSelected: false, listItemUri: undefined, loading: false }
              : l
          )
        );
      } else {
        // Add to list
        const result = await addToList(listUri, targetDid);
        setLists((prev) =>
          prev.map((l) =>
            l.uri === listUri
              ? { ...l, isSelected: true, listItemUri: result.uri, loading: false }
              : l
          )
        );
      }
    } catch (err) {
      console.error('Failed to update list membership:', err);
      setLists((prev) =>
        prev.map((l) => (l.uri === listUri ? { ...l, loading: false } : l))
      );
    }
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const displayName = targetDisplayName || targetHandle || targetDid.slice(0, 16);

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Add to list
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {displayName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-red-500 dark:text-red-400">{error}</p>
            </div>
          ) : lists.length === 0 ? (
            <div className="p-8 text-center">
              <svg
                className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 mb-2">No lists yet</p>
              <p className="text-sm text-gray-400">
                Create a list in the{' '}
                <a href="/lists" className="text-blue-500 hover:underline">
                  Lists Manager
                </a>{' '}
                to organize users.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {lists.map((list) => (
                <button
                  key={list.uri}
                  onClick={() => handleToggle(list.uri)}
                  disabled={list.loading}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50"
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      list.isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {list.loading ? (
                      <svg
                        className="animate-spin w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : list.isSelected ? (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}
                  </div>

                  {/* List avatar */}
                  {list.avatar ? (
                    <img
                      src={list.avatar}
                      alt=""
                      className="w-10 h-10 rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {list.name[0].toUpperCase()}
                    </div>
                  )}

                  {/* List info */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {list.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {list.listItemCount ?? 0} member
                      {(list.listItemCount ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <a
            href="/lists"
            className="text-sm text-blue-500 hover:text-blue-600 hover:underline"
          >
            Manage lists
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}
