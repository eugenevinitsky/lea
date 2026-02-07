'use client';

import { useState, useEffect } from 'react';
import {
  getSession,
  getMyLists,
  getListMembers,
  deleteList,
  removeFromList,
  ListView,
  ListItemView,
} from '@/lib/bluesky';
import { useModerationLayout } from '../layout';
import ListEditorModal from '@/components/ListEditorModal';
import ProfileHoverCard from '@/components/ProfileHoverCard';

export default function ListsPage() {
  const { handleOpenProfile } = useModerationLayout();

  // Lists state
  const [lists, setLists] = useState<ListView[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [selectedList, setSelectedList] = useState<ListView | null>(null);
  const [members, setMembers] = useState<ListItemView[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingList, setEditingList] = useState<ListView | null>(null);
  const [deletingList, setDeletingList] = useState<ListView | null>(null);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const myLists = await getMyLists();
      setLists(myLists);
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoadingLists(false);
    }
  };

  const handleSelectList = async (list: ListView) => {
    setSelectedList(list);
    setMembers([]);
    setLoadingMembers(true);
    try {
      const listMembers = await getListMembers(list.uri);
      setMembers(listMembers);
    } catch (err) {
      console.error('Failed to load list members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleRemoveMember = async (member: ListItemView) => {
    setRemovingMember(member.subject.did);
    try {
      await removeFromList(member.uri);
      setMembers((prev) => prev.filter((m) => m.uri !== member.uri));
      setLists((prev) =>
        prev.map((l) =>
          l.uri === selectedList?.uri
            ? { ...l, listItemCount: (l.listItemCount ?? 1) - 1 }
            : l
        )
      );
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setRemovingMember(null);
    }
  };

  const handleDeleteList = async () => {
    if (!deletingList) return;
    try {
      await deleteList(deletingList.uri);
      setLists((prev) => prev.filter((l) => l.uri !== deletingList.uri));
      if (selectedList?.uri === deletingList.uri) {
        setSelectedList(null);
        setMembers([]);
      }
    } catch (err) {
      console.error('Failed to delete list:', err);
    } finally {
      setDeletingList(null);
    }
  };

  const handleListSaved = (savedList: { uri: string; name: string; description?: string }) => {
    if (editingList) {
      setLists((prev) =>
        prev.map((l) =>
          l.uri === savedList.uri
            ? { ...l, name: savedList.name, description: savedList.description }
            : l
        )
      );
      if (selectedList?.uri === savedList.uri) {
        setSelectedList((prev) =>
          prev ? { ...prev, name: savedList.name, description: savedList.description } : null
        );
      }
      setEditingList(null);
    } else {
      const newList: ListView = {
        uri: savedList.uri,
        cid: '',
        name: savedList.name,
        description: savedList.description,
        purpose: 'app.bsky.graph.defs#curatelist',
        listItemCount: 0,
        indexedAt: new Date().toISOString(),
        creator: {
          did: getSession()?.did || '',
          handle: '',
        },
      };
      setLists((prev) => [newList, ...prev]);
      setShowCreateModal(false);
    }
  };

  return (
    <>
      {/* Header with back button */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Lists</h2>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Lists */}
        {!selectedList ? (
          <div>
            {loadingLists ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : lists.length === 0 ? (
              <div className="p-8 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">No lists yet</p>
                <p className="text-sm text-gray-400">Create a list to organize users.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {lists.map((list) => (
                  <button
                    key={list.uri}
                    onClick={() => handleSelectList(list)}
                    className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {list.avatar ? (
                        <img src={list.avatar} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {list.name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {list.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {list.listItemCount ?? 0} member{(list.listItemCount ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Selected list header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <button
                onClick={() => { setSelectedList(null); setMembers([]); }}
                className="text-sm text-blue-500 hover:text-blue-600 mb-3 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to lists
              </button>
              <div className="flex items-start gap-3">
                {selectedList.avatar ? (
                  <img src={selectedList.avatar} alt="" className="w-12 h-12 rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {selectedList.name[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedList.name}</h3>
                  {selectedList.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{selectedList.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingList(selectedList)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Edit list"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeletingList(selectedList)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete list"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Members */}
            <div>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 mb-2">No members yet</p>
                  <p className="text-sm text-gray-400">Add users to this list from their profile.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {members.map((member) => (
                    <div key={member.uri} className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <ProfileHoverCard
                        did={member.subject.did}
                        handle={member.subject.handle}
                        onOpenProfile={() => handleOpenProfile(member.subject.did)}
                      >
                        {member.subject.avatar ? (
                          <img
                            src={member.subject.avatar}
                            alt=""
                            className="w-10 h-10 rounded-full flex-shrink-0 cursor-pointer hover:opacity-80"
                            onClick={() => handleOpenProfile(member.subject.did)}
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 cursor-pointer hover:opacity-80"
                            onClick={() => handleOpenProfile(member.subject.did)}
                          >
                            {(member.subject.displayName || member.subject.handle)[0].toUpperCase()}
                          </div>
                        )}
                      </ProfileHoverCard>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-medium text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:text-blue-500"
                          onClick={() => handleOpenProfile(member.subject.did)}
                        >
                          {member.subject.displayName || member.subject.handle}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          @{member.subject.handle}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member)}
                        disabled={removingMember === member.subject.did}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Remove from list"
                      >
                        {removingMember === member.subject.did ? (
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create List Modal */}
      {showCreateModal && (
        <ListEditorModal
          onSave={handleListSaved}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit List Modal */}
      {editingList && (
        <ListEditorModal
          list={editingList}
          onSave={handleListSaved}
          onClose={() => setEditingList(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingList && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDeletingList(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Delete list?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Are you sure you want to delete &quot;{deletingList.name}&quot;? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeletingList(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteList}
                  className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
