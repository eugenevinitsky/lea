'use client';

import { useState, useRef, useEffect } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '🙄', '😬', '😮', '🤐', '😯', '😲', '😳', '🥺', '😢', '😭', '😤', '😠', '🤯', '😱', '🥶', '🥵', '😴', '🤔', '🤗', '🫡', '🫠', '🫢'],
  },
  {
    name: 'Gestures',
    icon: '👋',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪', '🦾'],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '🫀'],
  },
  {
    name: 'Science',
    icon: '🔬',
    emojis: ['🔬', '🧬', '🧪', '🧫', '🧲', '⚗️', '🔭', '📡', '💻', '🖥️', '⌨️', '🖱️', '📊', '📈', '📉', '📋', '📌', '📎', '🔗', '📚', '📖', '📝', '✏️', '🖊️', '📐', '📏', '🧮', '🔢', '🧠', '💡', '⚡', '🌡️', '🔋', '⚙️', '🛠️', '🤖', '🧑‍🔬', '👩‍🔬', '👨‍🔬'],
  },
  {
    name: 'Nature',
    icon: '🌿',
    emojis: ['🌱', '🌿', '🍀', '🌵', '🌲', '🌳', '🌴', '🌸', '🌺', '🌻', '🌼', '🌷', '🌹', '🪻', '🪷', '☀️', '🌤️', '⛅', '🌈', '⭐', '🌟', '✨', '🔥', '💧', '🌊', '🌍', '🌎', '🌏', '🌙', '🦋', '🐝', '🐛', '🐌', '🐞'],
  },
  {
    name: 'Food',
    icon: '🍕',
    emojis: ['🍎', '🍊', '🍋', '🍌', '🍇', '🍓', '🫐', '🍒', '🍑', '🥝', '🥑', '🍕', '🍔', '🍟', '🌮', '🌯', '🥗', '🍜', '🍣', '🍩', '🍪', '🎂', '🍰', '☕', '🍵', '🧋', '🥤', '🍺', '🍷', '🥂', '🧃'],
  },
  {
    name: 'Activities',
    icon: '⚽',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🎯', '🎮', '🎲', '🎨', '🎭', '🎪', '🎤', '🎧', '🎵', '🎶', '🎹', '🎸', '🎺', '🎻', '🥁', '🏆', '🏅', '🥇', '🎖️'],
  },
  {
    name: 'Objects',
    icon: '💼',
    emojis: ['📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📹', '🎥', '📞', '☎️', '📺', '📻', '⏰', '⌚', '💡', '🔦', '🔧', '🔨', '🔩', '🗝️', '🔑', '🔒', '🔓', '💼', '📁', '📂', '📬', '📮', '🗑️', '📦'],
  },
  {
    name: 'Symbols',
    icon: '✅',
    emojis: ['✅', '❌', '❓', '❗', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '▶️', '⏸️', '⏹️', '⏺️', '⏭️', '⏮️', '🔀', '🔁', '🔂', '➕', '➖', '➗', '✖️', '♾️', '💲', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔜', '🔝'],
  },
  {
    name: 'Flags',
    icon: '🚩',
    emojis: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇳', '🏴‍☠️'],
  },
];

export default function EmojiPicker({ onSelect, className = '' }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleEmojiClick = (emoji: string) => {
    onSelect(emoji);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={pickerRef}>
      {/* Emoji button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        title="Add emoji"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Picker dropdown */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 w-[320px]">
          {/* Category tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 p-1 gap-0.5 overflow-x-auto scrollbar-hide">
            {EMOJI_CATEGORIES.map((cat, index) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(index)}
                className={`p-1.5 rounded-lg text-base transition-colors flex-shrink-0 ${
                  activeCategory === index
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 max-h-[200px] overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 px-1">
              {EMOJI_CATEGORIES[activeCategory].name}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="p-1.5 text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
