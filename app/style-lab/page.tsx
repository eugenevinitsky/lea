'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Theme token types
// ---------------------------------------------------------------------------
interface ThemeTokens {
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  headingSize: string;
  subheadingSize: string;
  bodySize: string;
  smallSize: string;
  headingWeight: string;
  headingLetterSpacing: string;
  bodyLineHeight: string;
  bg: string;
  fg: string;
  accent: string;
  accentFg: string;
  muted: string;
  border: string;
  cardBg: string;
  highlightBg: string;
  cardRadius: string;
  cardPadding: string;
  borderWidth: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
const PRESETS: Record<string, { label: string; tokens: ThemeTokens }> = {
  default: {
    label: 'Default',
    tokens: {
      headingFont: 'Geist, system-ui, sans-serif',
      bodyFont: 'Geist, system-ui, sans-serif',
      monoFont: 'Geist Mono, monospace',
      headingSize: '1.5rem',
      subheadingSize: '0.875rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '700',
      headingLetterSpacing: '0',
      bodyLineHeight: '1.5',
      bg: '#f9fafb',
      fg: '#111827',
      accent: '#3b82f6',
      accentFg: '#ffffff',
      muted: '#6b7280',
      border: '#e5e7eb',
      cardBg: '#ffffff',
      highlightBg: '#eff6ff',
      cardRadius: '0.75rem',
      cardPadding: '1rem',
      borderWidth: '1px',
    },
  },
  surface: {
    label: 'Surface',
    tokens: {
      headingFont: 'Playfair Display, Georgia, serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'Geist Mono, monospace',
      headingSize: '1.75rem',
      subheadingSize: '0.95rem',
      bodySize: '0.9rem',
      smallSize: '0.8rem',
      headingWeight: '800',
      headingLetterSpacing: '-0.02em',
      bodyLineHeight: '1.6',
      bg: '#fafafa',
      fg: '#1a1a1a',
      accent: '#1a1a1a',
      accentFg: '#ffffff',
      muted: '#737373',
      border: '#e0e0e0',
      cardBg: '#ffffff',
      highlightBg: '#f5f0eb',
      cardRadius: '0',
      cardPadding: '1.25rem',
      borderWidth: '1px',
    },
  },
  thibault: {
    label: 'Thibault',
    tokens: {
      headingFont: 'Space Grotesk, system-ui, sans-serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '2rem',
      subheadingSize: '1rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '700',
      headingLetterSpacing: '-0.03em',
      bodyLineHeight: '1.45',
      bg: '#ffffff',
      fg: '#0a0a0a',
      accent: '#e11d48',
      accentFg: '#ffffff',
      muted: '#525252',
      border: '#d4d4d4',
      cardBg: '#ffffff',
      highlightBg: '#fef2f2',
      cardRadius: '0.25rem',
      cardPadding: '0.875rem',
      borderWidth: '2px',
    },
  },
  academic: {
    label: 'Academic',
    tokens: {
      headingFont: 'Source Serif 4, Georgia, serif',
      bodyFont: 'Source Serif 4, Georgia, serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '1.5rem',
      subheadingSize: '0.95rem',
      bodySize: '0.9rem',
      smallSize: '0.8rem',
      headingWeight: '700',
      headingLetterSpacing: '0',
      bodyLineHeight: '1.65',
      bg: '#fdf8f0',
      fg: '#292524',
      accent: '#7c2d12',
      accentFg: '#ffffff',
      muted: '#78716c',
      border: '#e7e5e4',
      cardBg: '#fffdf9',
      highlightBg: '#fef3c7',
      cardRadius: '0.25rem',
      cardPadding: '1.25rem',
      borderWidth: '1px',
    },
  },
  midnight: {
    label: 'Midnight',
    tokens: {
      headingFont: 'Sora, system-ui, sans-serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '1.5rem',
      subheadingSize: '0.875rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '600',
      headingLetterSpacing: '-0.01em',
      bodyLineHeight: '1.5',
      bg: '#0f172a',
      fg: '#e2e8f0',
      accent: '#818cf8',
      accentFg: '#ffffff',
      muted: '#94a3b8',
      border: '#1e293b',
      cardBg: '#1e293b',
      highlightBg: '#1e1b4b',
      cardRadius: '0.75rem',
      cardPadding: '1rem',
      borderWidth: '1px',
    },
  },
  soft: {
    label: 'Soft',
    tokens: {
      headingFont: 'DM Sans, system-ui, sans-serif',
      bodyFont: 'DM Sans, system-ui, sans-serif',
      monoFont: 'Geist Mono, monospace',
      headingSize: '1.375rem',
      subheadingSize: '0.875rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '600',
      headingLetterSpacing: '0',
      bodyLineHeight: '1.55',
      bg: '#faf5ff',
      fg: '#3b0764',
      accent: '#9333ea',
      accentFg: '#ffffff',
      muted: '#7e22ce',
      border: '#e9d5ff',
      cardBg: '#ffffff',
      highlightBg: '#f3e8ff',
      cardRadius: '1rem',
      cardPadding: '1rem',
      borderWidth: '1px',
    },
  },
  brutalist: {
    label: 'Brutalist',
    tokens: {
      headingFont: 'Space Grotesk, system-ui, sans-serif',
      bodyFont: 'Space Grotesk, system-ui, sans-serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '2rem',
      subheadingSize: '1rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '700',
      headingLetterSpacing: '-0.04em',
      bodyLineHeight: '1.4',
      bg: '#ffffff',
      fg: '#000000',
      accent: '#000000',
      accentFg: '#ffffff',
      muted: '#555555',
      border: '#000000',
      cardBg: '#ffffff',
      highlightBg: '#f0f0f0',
      cardRadius: '0',
      cardPadding: '1rem',
      borderWidth: '2px',
    },
  },
  forest: {
    label: 'Forest',
    tokens: {
      headingFont: 'Libre Baskerville, Georgia, serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '1.5rem',
      subheadingSize: '0.875rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '700',
      headingLetterSpacing: '0',
      bodyLineHeight: '1.55',
      bg: '#f0fdf4',
      fg: '#14532d',
      accent: '#16a34a',
      accentFg: '#ffffff',
      muted: '#4d7c0f',
      border: '#bbf7d0',
      cardBg: '#ffffff',
      highlightBg: '#dcfce7',
      cardRadius: '0.5rem',
      cardPadding: '1rem',
      borderWidth: '1px',
    },
  },
  monochrome: {
    label: 'Mono',
    tokens: {
      headingFont: 'Outfit, system-ui, sans-serif',
      bodyFont: 'Outfit, system-ui, sans-serif',
      monoFont: 'Geist Mono, monospace',
      headingSize: '1.5rem',
      subheadingSize: '0.875rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '600',
      headingLetterSpacing: '-0.01em',
      bodyLineHeight: '1.5',
      bg: '#fafafa',
      fg: '#171717',
      accent: '#404040',
      accentFg: '#fafafa',
      muted: '#737373',
      border: '#e5e5e5',
      cardBg: '#ffffff',
      highlightBg: '#f5f5f5',
      cardRadius: '0.375rem',
      cardPadding: '1rem',
      borderWidth: '1px',
    },
  },
  meutzner: {
    label: 'Meutzner',
    tokens: {
      headingFont: 'Cormorant Garamond, Georgia, serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'Space Mono, monospace',
      headingSize: '1.625rem',
      subheadingSize: '0.9rem',
      bodySize: '0.875rem',
      smallSize: '0.75rem',
      headingWeight: '400',
      headingLetterSpacing: '0.02em',
      bodyLineHeight: '1.6',
      bg: '#fafafa',
      fg: '#202020',
      accent: '#d9cae0',
      accentFg: '#202020',
      muted: '#999999',
      border: '#e8e8e8',
      cardBg: '#ffffff',
      highlightBg: '#f3eff5',
      cardRadius: '0',
      cardPadding: '1.25rem',
      borderWidth: '1px',
    },
  },
  institute: {
    label: 'Institute',
    tokens: {
      headingFont: 'Space Mono, monospace',
      bodyFont: 'Space Mono, monospace',
      monoFont: 'Space Mono, monospace',
      headingSize: '1.375rem',
      subheadingSize: '0.8125rem',
      bodySize: '0.8125rem',
      smallSize: '0.6875rem',
      headingWeight: '700',
      headingLetterSpacing: '0',
      bodyLineHeight: '1.23',
      bg: '#ffffff',
      fg: '#0054a6',
      accent: '#0054a6',
      accentFg: '#ffffff',
      muted: '#5a8abd',
      border: '#0054a6',
      cardBg: '#ffffff',
      highlightBg: '#eef4fb',
      cardRadius: '0',
      cardPadding: '1.25rem',
      borderWidth: '1.5px',
    },
  },
};

const PRESET_NAMES = Object.keys(PRESETS);

// ---------------------------------------------------------------------------
// Google Fonts
// ---------------------------------------------------------------------------
const GOOGLE_FONTS = [
  'Playfair+Display:wght@400;600;700;800',
  'Inter:wght@300;400;500;600;700',
  'Space+Grotesk:wght@400;500;600;700',
  'Space+Mono:wght@400;700',
  'DM+Sans:wght@400;500;600;700',
  'DM+Serif+Display:wght@400',
  'Libre+Baskerville:wght@400;700',
  'Source+Serif+4:wght@400;600;700',
  'Sora:wght@400;500;600;700',
  'Outfit:wght@400;500;600;700',
  'Cormorant+Garamond:wght@300;400;500;600;700',
];

function loadGoogleFonts() {
  if (typeof document === 'undefined') return;
  const id = 'style-lab-google-fonts';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FONTS.map(f => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

const FONT_OPTIONS = [
  'Geist, system-ui, sans-serif',
  'Inter, system-ui, sans-serif',
  'Space Grotesk, system-ui, sans-serif',
  'DM Sans, system-ui, sans-serif',
  'Sora, system-ui, sans-serif',
  'Outfit, system-ui, sans-serif',
  'Playfair Display, Georgia, serif',
  'DM Serif Display, Georgia, serif',
  'Libre Baskerville, Georgia, serif',
  'Source Serif 4, Georgia, serif',
  'Cormorant Garamond, Georgia, serif',
  'Space Mono, monospace',
  'Geist Mono, monospace',
];

const STORAGE_KEY = 'lea-style-lab-tokens';

function loadSaved(): ThemeTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveTokens(tokens: ThemeTokens) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function FontSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full text-sm bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        style={{ fontFamily: value }}
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f.split(',')[0]}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0"
      />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-gray-400 font-mono">{value}</span>
      </div>
    </label>
  );
}

function RangeInput({ label, value, onChange, min, max, step, unit }: {
  label: string; value: string; onChange: (v: string) => void;
  min: number; max: number; step: number; unit: string;
}) {
  const num = parseFloat(value);
  return (
    <label className="block">
      <div className="flex justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-gray-400 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={num}
        onChange={(e) => onChange(`${e.target.value}${unit}`)}
        className="mt-1 w-full accent-blue-500"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const MOCK_POSTS = [
  {
    author: 'Leslie Root',
    handle: 'leslieroot.bsky.social',
    text: 'New paper on transformer interpretability just dropped — we show that attention heads in layers 8–12 consistently encode syntactic dependency arcs. Big implications for probing studies.',
    time: '2h',
    likes: 47,
    reposts: 12,
    replies: 8,
    hasLink: true,
    linkTitle: 'Syntactic Structure in Attention Heads',
    linkDomain: 'arxiv.org',
    verified: true,
  },
  {
    author: 'Ted Underwood',
    handle: 'tedunderwood.bsky.social',
    text: 'I keep thinking about the gap between how we evaluate LLMs in benchmarks vs. how humanists actually want to use them. The tasks that matter most — nuanced interpretation, handling ambiguity — are exactly the ones we\'re worst at measuring.',
    time: '4h',
    likes: 103,
    reposts: 31,
    replies: 22,
    verified: true,
  },
  {
    author: 'Devon Dopfel',
    handle: 'devondopfel.bsky.social',
    text: 'We\'re hiring postdocs in computational social science at UW! Looking for people interested in studying online communities, platform governance, or algorithmic curation. Remote-friendly.',
    time: '6h',
    likes: 89,
    reposts: 45,
    replies: 5,
    verified: true,
  },
  {
    author: 'Emily Bender',
    handle: 'emilybender.bsky.social',
    text: 'Thread on why "alignment" framing obscures more than it reveals. The metaphor assumes a single axis along which systems can be oriented, but the actual problem space is multi-dimensional and context-dependent.',
    time: '8h',
    likes: 215,
    reposts: 67,
    replies: 34,
    verified: true,
  },
  {
    author: 'Yolanda Gil',
    handle: 'yolandagil.bsky.social',
    text: 'Excited to share our new paper on AI-assisted scientific discovery. We show that LLMs can help generate novel hypotheses when properly grounded in domain knowledge.',
    time: '12h',
    likes: 156,
    reposts: 38,
    replies: 19,
    hasLink: true,
    linkTitle: 'Grounded Hypothesis Generation with LLMs',
    linkDomain: 'arxiv.org',
    verified: true,
  },
  {
    author: 'Percy Liang',
    handle: 'percyliang.bsky.social',
    text: 'Just realized I\'ve been using three different notation conventions for the same concept across my last four papers. Consistency is hard when you write with 20 collaborators.',
    time: '14h',
    likes: 312,
    reposts: 15,
    replies: 41,
    verified: false,
  },
];

const FEED_TABS = ['Following', 'Researchers', 'Papers', 'NLP', 'CompSci'];

// ---------------------------------------------------------------------------
// Preview components
// ---------------------------------------------------------------------------

function PreviewHeader({ t }: { t: ThemeTokens }) {
  return (
    <header
      style={{
        background: t.cardBg,
        borderBottom: `${t.borderWidth} solid ${t.border}`,
        padding: '0.625rem 1rem',
        fontFamily: t.bodyFont,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontFamily: t.headingFont,
          fontWeight: Number(t.headingWeight),
          fontSize: '1.125rem',
          letterSpacing: t.headingLetterSpacing,
          color: t.fg,
        }}
      >
        Lea
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div
          style={{
            background: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: '9999px',
            padding: '0.3rem 0.75rem',
            fontSize: t.smallSize,
            color: t.muted,
            width: '170px',
            fontFamily: t.bodyFont,
          }}
        >
          Search researchers…
        </div>
        <div
          style={{
            width: '1.75rem',
            height: '1.75rem',
            borderRadius: '9999px',
            background: `linear-gradient(135deg, ${t.accent}44, ${t.accent}88)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.625rem',
            fontWeight: 700,
            color: t.accentFg,
          }}
        >
          M
        </div>
      </div>
    </header>
  );
}

function PreviewSidebar({ t }: { t: ThemeTokens }) {
  const items = [
    { label: 'Bookmarks', icon: '🔖' },
    { label: 'Messages', icon: '💬' },
    { label: 'Notifications', icon: '🔔', dot: true },
    { label: 'Discover', icon: '🔍' },
    { label: 'Moderation', icon: '🛡️' },
    { label: 'Settings', icon: '⚙️' },
  ];
  return (
    <nav
      style={{
        fontFamily: t.bodyFont,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
        padding: '0.5rem 0',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '0.4rem 0.625rem',
            borderRadius: t.cardRadius,
            color: t.fg,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
            fontSize: t.smallSize,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.highlightBg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: '0.8rem', width: '1.125rem', textAlign: 'center' }}>{item.icon}</span>
          <span>{item.label}</span>
          {item.dot && (
            <span
              style={{
                width: '0.4rem',
                height: '0.4rem',
                borderRadius: '9999px',
                background: t.accent,
                marginLeft: 'auto',
              }}
            />
          )}
        </div>
      ))}
      <button
        style={{
          marginTop: '0.375rem',
          padding: '0.375rem',
          borderRadius: '9999px',
          background: t.accent,
          color: t.accentFg,
          fontWeight: 600,
          fontSize: t.smallSize,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          fontFamily: t.bodyFont,
        }}
      >
        New Post
      </button>
    </nav>
  );
}

function PreviewFeedTabs({ t }: { t: ThemeTokens }) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${t.border}`,
        fontFamily: t.bodyFont,
        fontSize: t.smallSize,
        overflowX: 'auto',
      }}
    >
      {FEED_TABS.map((tab, i) => (
        <button
          key={tab}
          style={{
            padding: '0.5rem 0.75rem',
            fontWeight: i === 0 ? 600 : 500,
            color: i === 0 ? t.accent : t.muted,
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${i === 0 ? t.accent : 'transparent'}`,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            fontFamily: t.bodyFont,
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function PreviewPost({ t, post }: {
  t: ThemeTokens;
  post: typeof MOCK_POSTS[0];
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.625rem',
        padding: t.cardPadding,
        borderBottom: `1px solid ${t.border}`,
        fontFamily: t.bodyFont,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.highlightBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar */}
      <div
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '9999px',
          background: `linear-gradient(135deg, ${t.accent}33, ${t.accent}66)`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: t.accent,
        }}
      >
        {post.author[0]}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Author line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: t.bodySize, fontWeight: 600, color: t.fg }}>{post.author}</span>
          {post.verified && (
            <span style={{ fontSize: '0.7rem', color: t.accent }} title="Verified researcher">✓</span>
          )}
          <span style={{ fontSize: t.smallSize, color: t.muted }}>@{post.handle}</span>
          <span style={{ fontSize: t.smallSize, color: t.muted }}>· {post.time}</span>
        </div>

        {/* Post text */}
        <p style={{
          margin: '0.25rem 0 0',
          fontSize: t.bodySize,
          lineHeight: t.bodyLineHeight,
          color: t.fg,
        }}>
          {post.text}
        </p>

        {/* Link embed */}
        {post.hasLink && post.linkTitle && (
          <div
            style={{
              marginTop: '0.5rem',
              border: `1px solid ${t.border}`,
              borderRadius: t.cardRadius,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '0.5rem 0.75rem', background: t.highlightBg }}>
              <div style={{ fontSize: t.smallSize, color: t.muted, marginBottom: '0.125rem' }}>
                📄 {post.linkDomain}
              </div>
              <div style={{ fontSize: t.bodySize, fontWeight: 600, color: t.fg }}>
                {post.linkTitle}
              </div>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '0.5rem',
          fontSize: t.smallSize,
          color: t.muted,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            💬 {post.replies}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            🔄 {post.reposts}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            ❤️ {post.likes}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', marginLeft: 'auto' }}>
            🔖
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewRightSidebar({ t }: { t: ThemeTokens }) {
  return (
    <div
      style={{
        fontFamily: t.bodyFont,
        fontSize: t.smallSize,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${t.border}`,
        borderRight: `1px solid ${t.border}`,
      }}
    >
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ flex: 1, padding: '0.375rem', textAlign: 'center', color: t.muted, cursor: 'pointer' }}>↻</div>
        <div style={{ flex: 1, padding: '0.375rem', textAlign: 'center', color: t.muted, cursor: 'pointer', borderLeft: `1px solid ${t.border}` }}>↑</div>
      </div>
      {FEED_TABS.map((tab, i) => (
        <div
          key={tab}
          style={{
            padding: '0.4rem 0.5rem',
            fontWeight: i === 0 ? 600 : 500,
            color: i === 0 ? t.accent : t.muted,
            background: i === 0 ? t.cardBg : 'transparent',
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: t.bodyFont,
          }}
          onMouseEnter={(e) => { if (i !== 0) e.currentTarget.style.background = t.highlightBg; }}
          onMouseLeave={(e) => { if (i !== 0) e.currentTarget.style.background = 'transparent'; }}
        >
          {tab}
        </div>
      ))}
      <div
        style={{
          padding: '0.4rem 0.5rem',
          color: t.muted,
          cursor: 'pointer',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontFamily: t.bodyFont,
        }}
      >
        ⚙ Feeds
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function StyleLabPage() {
  const [tokens, setTokens] = useState<ThemeTokens>(() => loadSaved() || PRESETS.default.tokens);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleFonts();
  }, []);

  useEffect(() => {
    saveTokens(tokens);
  }, [tokens]);

  const update = useCallback((key: keyof ThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }, []);

  const applyPreset = (name: string) => {
    setTokens(PRESETS[name].tokens);
    setActivePreset(name);
  };

  const exportTokens = () => {
    const json = JSON.stringify(tokens, null, 2);
    navigator.clipboard.writeText(json);
    alert('Theme tokens copied to clipboard!');
  };

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#1f2937', color: '#f9fafb', padding: '0.625rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a href="/" style={{ color: '#60a5fa', fontWeight: 700, textDecoration: 'none', fontSize: '0.875rem' }}>← Lea</a>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Style Lab</span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Design playground</span>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                border: activePreset === name ? '2px solid #60a5fa' : '1px solid #4b5563',
                background: activePreset === name ? '#1e3a5f' : 'transparent',
                color: activePreset === name ? '#93c5fd' : '#d1d5db',
                cursor: 'pointer',
              }}
            >
              {PRESETS[name].label}
            </button>
          ))}
          <button
            onClick={exportTokens}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              border: '1px solid #4b5563',
              background: 'transparent',
              color: '#d1d5db',
              cursor: 'pointer',
              marginLeft: '0.25rem',
            }}
          >
            Copy JSON
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', padding: '1.25rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* ── Controls Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Typography */}
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '0.875rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.625rem' }}>Typography</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <FontSelect label="Heading Font" value={tokens.headingFont} onChange={(v) => update('headingFont', v)} />
              <FontSelect label="Body Font" value={tokens.bodyFont} onChange={(v) => update('bodyFont', v)} />
              <RangeInput label="Heading Size" value={tokens.headingSize} onChange={(v) => update('headingSize', v)} min={1} max={3} step={0.125} unit="rem" />
              <RangeInput label="Body Size" value={tokens.bodySize} onChange={(v) => update('bodySize', v)} min={0.625} max={1.25} step={0.0625} unit="rem" />
              <RangeInput label="Heading Weight" value={tokens.headingWeight} onChange={(v) => update('headingWeight', v.replace(/[^\d]/g, ''))} min={400} max={900} step={100} unit="" />
              <RangeInput label="Letter Spacing" value={tokens.headingLetterSpacing} onChange={(v) => update('headingLetterSpacing', v)} min={-0.05} max={0.1} step={0.005} unit="em" />
              <RangeInput label="Line Height" value={tokens.bodyLineHeight} onChange={(v) => update('bodyLineHeight', v.replace(/[a-z]/g, ''))} min={1.2} max={2} step={0.05} unit="" />
            </div>
          </div>

          {/* Colors */}
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '0.875rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.625rem' }}>Colors</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              <ColorInput label="Background" value={tokens.bg} onChange={(v) => update('bg', v)} />
              <ColorInput label="Foreground" value={tokens.fg} onChange={(v) => update('fg', v)} />
              <ColorInput label="Accent" value={tokens.accent} onChange={(v) => update('accent', v)} />
              <ColorInput label="Muted" value={tokens.muted} onChange={(v) => update('muted', v)} />
              <ColorInput label="Border" value={tokens.border} onChange={(v) => update('border', v)} />
              <ColorInput label="Card BG" value={tokens.cardBg} onChange={(v) => update('cardBg', v)} />
              <ColorInput label="Highlight" value={tokens.highlightBg} onChange={(v) => update('highlightBg', v)} />
            </div>
          </div>

          {/* Shape */}
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '0.875rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.625rem' }}>Shape &amp; Spacing</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <RangeInput label="Card Radius" value={tokens.cardRadius} onChange={(v) => update('cardRadius', v)} min={0} max={1.5} step={0.125} unit="rem" />
              <RangeInput label="Card Padding" value={tokens.cardPadding} onChange={(v) => update('cardPadding', v)} min={0.5} max={2} step={0.125} unit="rem" />
              <RangeInput label="Border Width" value={tokens.borderWidth} onChange={(v) => update('borderWidth', v)} min={0} max={3} step={0.5} unit="px" />
            </div>
          </div>
        </div>

        {/* ── Preview Area: Homepage Layout ── */}
        <div
          style={{
            background: tokens.bg,
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* App header */}
          <PreviewHeader t={tokens} />

          {/* Main layout: sidebar + feed + right sidebar */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px', flex: 1 }}>
            {/* Left sidebar */}
            <div style={{ background: tokens.cardBg, borderRight: `1px solid ${tokens.border}`, padding: '0.25rem 0.375rem' }}>
              <PreviewSidebar t={tokens} />
            </div>

            {/* Center: feed tabs + posts */}
            <div style={{ background: tokens.cardBg, display: 'flex', flexDirection: 'column' }}>
              <PreviewFeedTabs t={tokens} />
              <div>
                {MOCK_POSTS.map((post, i) => (
                  <PreviewPost key={i} t={tokens} post={post} />
                ))}
              </div>
            </div>

            {/* Right sidebar: vertical feed tabs */}
            <div style={{ background: tokens.bg }}>
              <PreviewRightSidebar t={tokens} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
