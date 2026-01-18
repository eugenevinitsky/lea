'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ListPickerModal from './ListPickerModal';

interface UserActionsMenuProps {
  did: string;
  handle?: string;
  displayName?: string;
  isBlocking?: boolean;
  blockUri?: string;
  onBlock?: () => void;
  onUnblock?: () => void;
  blockLoading?: boolean;
  // Compact mode for inline usage (smaller button)
  compact?: boolean;
}

export default function UserActionsMenu({
  did,
  handle,
  displayName,
  isBlocking,
  blockUri,
  onBlock,
  onUnblock,
  blockLoading,
  compact = false,
}: UserActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showListPicker, setShowListPicker] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the menu when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = 100; // approximate

      let left = rect.right - menuWidth;
      let top = rect.bottom + 4;

      // Adjust if would go off screen
      if (left < 8) left = 8;
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }

      setMenuPosition({ top, left });
    }
  }, [isOpen]);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleBlockClick = () => {
    setIsOpen(false);
    if (isBlocking) {
      onUnblock?.();
    } else {
      onBlock?.();
    }
  };

  const handleAddToListClick = () => {
    setIsOpen(false);
    setShowListPicker(true);
  };

  const menuContent = isOpen && (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-44 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 overflow-hidden"
      style={{ top: menuPosition.top, left: menuPosition.left }}
    >
      {/* Add to list option */}
      <button
        onClick={handleAddToListClick}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        Add to list
      </button>

      {/* Divider */}
      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

      {/* Block option */}
      <button
        onClick={handleBlockClick}
        disabled={blockLoading}
        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
          isBlocking
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        } disabled:opacity-50`}
      >
        {blockLoading ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )}
        {isBlocking ? 'Unblock' : 'Block'}
      </button>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`${
          compact
            ? 'p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded'
            : 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg'
        } text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors`}
        title="More options"
      >
        <svg
          className={compact ? 'w-4 h-4' : 'w-5 h-5'}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {typeof document !== 'undefined' && createPortal(menuContent, document.body)}

      {showListPicker && (
        <ListPickerModal
          targetDid={did}
          targetHandle={handle}
          targetDisplayName={displayName}
          onClose={() => setShowListPicker(false)}
        />
      )}
    </>
  );
}
