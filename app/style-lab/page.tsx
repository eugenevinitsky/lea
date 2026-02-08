'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Theme token types
// ---------------------------------------------------------------------------
interface ThemeTokens {
  // Fonts
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  // Sizes
  headingSize: string;     // e.g. '2rem'
  subheadingSize: string;  // e.g. '1.15rem'
  bodySize: string;        // e.g. '0.875rem'
  smallSize: string;       // e.g. '0.75rem'
  headingWeight: string;
  headingLetterSpacing: string;
  bodyLineHeight: string;
  // Colors
  bg: string;
  fg: string;
  accent: string;
  accentFg: string;
  muted: string;
  border: string;
  cardBg: string;
  highlightBg: string;
  // Spacing / shape
  cardRadius: string;
  cardPadding: string;
  borderWidth: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
const PRESETS: Record<string, ThemeTokens> = {
  default: {
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
  surface: {
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
  thibault: {
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
};

const PRESET_NAMES = Object.keys(PRESETS) as (keyof typeof PRESETS)[];

// ---------------------------------------------------------------------------
// Google Fonts loader
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

// Font options for dropdowns
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
  'Space Mono, monospace',
  'Geist Mono, monospace',
];

// localStorage key
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
// Preview components (self-contained, using inline styles from tokens)
// ---------------------------------------------------------------------------

function PreviewHeader({ t }: { t: ThemeTokens }) {
  return (
    <header
      style={{
        background: t.cardBg,
        borderBottom: `${t.borderWidth} solid ${t.border}`,
        padding: '0.75rem 1.25rem',
        fontFamily: t.bodyFont,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: t.headingFont,
            fontWeight: Number(t.headingWeight),
            fontSize: '1.25rem',
            letterSpacing: t.headingLetterSpacing,
            color: t.accent,
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
              padding: '0.375rem 0.75rem',
              fontSize: t.smallSize,
              color: t.muted,
              width: '200px',
            }}
          >
            Search researchers…
          </div>
          <span
            style={{
              background: t.highlightBg,
              color: t.accent,
              borderRadius: '9999px',
              padding: '0.375rem 0.75rem',
              fontSize: t.smallSize,
              fontWeight: 500,
            }}
          >
            @maria.bsky.social
          </span>
        </div>
      </div>
    </header>
  );
}

function PreviewSidebar({ t }: { t: ThemeTokens }) {
  const items = [
    { label: 'Bookmarks', dot: false },
    { label: 'Messages', dot: false },
    { label: 'Notifications', dot: true },
    { label: 'Discover', dot: false },
    { label: 'Moderation', dot: false },
  ];
  return (
    <nav
      style={{
        fontFamily: t.bodyFont,
        fontSize: t.bodySize,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: t.cardRadius,
            color: t.fg,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 500,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.highlightBg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span>{item.label}</span>
          {item.dot && (
            <span
              style={{
                width: '0.5rem',
                height: '0.5rem',
                borderRadius: '9999px',
                background: t.accent,
              }}
            />
          )}
        </div>
      ))}
      <button
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem',
          borderRadius: '9999px',
          background: t.accent,
          color: t.accentFg,
          fontWeight: 600,
          fontSize: t.bodySize,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        New Post
      </button>
    </nav>
  );
}

function PreviewNotificationRow({ t, unread, icon, name, action, time, preview }: {
  t: ThemeTokens; unread: boolean; icon: string; name: string;
  action: string; time: string; preview?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderBottom: `1px solid ${t.border}`,
        background: unread ? t.highlightBg : 'transparent',
        fontFamily: t.bodyFont,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar placeholder */}
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
        {name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: t.smallSize, flexShrink: 0 }}>{icon}</span>
          <span style={{ fontSize: t.bodySize }}>
            <strong style={{ color: t.fg }}>{name}</strong>
            <span style={{ color: t.muted }}> {action}</span>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: t.smallSize, color: t.muted, flexShrink: 0 }}>{time}</span>
        </div>
        {preview && (
          <p style={{ marginTop: '0.125rem', fontSize: t.smallSize, color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview}
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewNotificationStream({ t }: { t: ThemeTokens }) {
  return (
    <div
      style={{
        background: t.cardBg,
        borderRadius: t.cardRadius,
        border: `${t.borderWidth} solid ${t.border}`,
        overflow: 'hidden',
      }}
    >
      <PreviewNotificationRow t={t} unread icon="❤️" name="Leslie Root" action="and 3 others liked your post" time="15m" preview="New paper on transformer interpretability just dropped..." />
      <PreviewNotificationRow t={t} unread icon="💬" name="Ted Underwood" action="replied to your post" time="32m" preview="Really interesting — have you seen the follow-up by Kim et al.?" />
      <PreviewNotificationRow t={t} unread={false} icon="🔄" name="Devon Dopfel" action="and 1 other reposted your post" time="2h" preview="We're hiring postdocs in computational social science..." />
      <PreviewNotificationRow t={t} unread={false} icon="💜" name="Ari Holtzman" action="quoted your post" time="5h" preview="Great thread on evaluation methodology. I'd add that..." />
      <PreviewNotificationRow t={t} unread={false} icon="@" name="Emily Bender" action="mentioned you" time="8h" preview="cc @maria — you might find this relevant to your work on..." />
    </div>
  );
}

function PreviewBookmarkTile({ t, author, text, tag }: {
  t: ThemeTokens; author: string; text: string; tag?: string;
}) {
  return (
    <div
      style={{
        background: t.cardBg,
        borderRadius: t.cardRadius,
        border: `${t.borderWidth} solid ${t.border}`,
        padding: t.cardPadding,
        fontFamily: t.bodyFont,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
        <div
          style={{
            width: '1.5rem',
            height: '1.5rem',
            borderRadius: '9999px',
            background: `${t.accent}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.625rem',
            fontWeight: 700,
            color: t.accent,
          }}
        >
          {author[0]}
        </div>
        <span style={{ fontSize: t.smallSize, fontWeight: 600, color: t.fg }}>{author}</span>
        <span style={{ fontSize: t.smallSize, color: t.muted }}>· 2d</span>
      </div>
      <p style={{ fontSize: t.bodySize, color: t.fg, lineHeight: t.bodyLineHeight, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {text}
      </p>
      {tag && (
        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: t.smallSize, color: t.accent, fontWeight: 500 }}>📄 {tag}</span>
        </div>
      )}
    </div>
  );
}

function PreviewFollowerRow({ t, name, handle, mutual }: {
  t: ThemeTokens; name: string; handle: string; mutual?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.5rem 0.75rem',
        borderBottom: `1px solid ${t.border}`,
        fontFamily: t.bodyFont,
      }}
    >
      <div
        style={{
          width: '2rem',
          height: '2rem',
          borderRadius: '9999px',
          background: `linear-gradient(135deg, ${t.muted}33, ${t.muted}66)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.625rem',
          fontWeight: 700,
          color: t.muted,
        }}
      >
        {name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: t.bodySize, fontWeight: 600, color: t.fg }}>{name}</div>
        <div style={{ fontSize: t.smallSize, color: t.muted }}>@{handle}</div>
      </div>
      {mutual && (
        <span style={{ fontSize: t.smallSize, color: t.muted }}>3 mutuals</span>
      )}
      <button
        style={{
          fontSize: t.smallSize,
          padding: '0.25rem 0.625rem',
          borderRadius: '9999px',
          background: `${t.accent}15`,
          color: t.accent,
          border: 'none',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Follow
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function StyleLabPage() {
  const [tokens, setTokens] = useState<ThemeTokens>(() => loadSaved() || PRESETS.default);
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
    setTokens(PRESETS[name]);
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
      <div style={{ background: '#1f2937', color: '#f9fafb', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/" style={{ color: '#60a5fa', fontWeight: 700, textDecoration: 'none' }}>← Lea</a>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Style Lab</span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Experimental design playground</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: activePreset === name ? '2px solid #60a5fa' : '1px solid #4b5563',
                background: activePreset === name ? '#1e3a5f' : 'transparent',
                color: activePreset === name ? '#93c5fd' : '#d1d5db',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {name}
            </button>
          ))}
          <button
            onClick={exportTokens}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: '1px solid #4b5563',
              background: 'transparent',
              color: '#d1d5db',
              cursor: 'pointer',
              marginLeft: '0.5rem',
            }}
          >
            Copy JSON
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* ── Controls Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Typography */}
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.75rem' }}>Typography</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.75rem' }}>Colors</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <ColorInput label="Background" value={tokens.bg} onChange={(v) => update('bg', v)} />
              <ColorInput label="Foreground" value={tokens.fg} onChange={(v) => update('fg', v)} />
              <ColorInput label="Accent" value={tokens.accent} onChange={(v) => update('accent', v)} />
              <ColorInput label="Muted" value={tokens.muted} onChange={(v) => update('muted', v)} />
              <ColorInput label="Border" value={tokens.border} onChange={(v) => update('border', v)} />
              <ColorInput label="Card BG" value={tokens.cardBg} onChange={(v) => update('cardBg', v)} />
              <ColorInput label="Highlight BG" value={tokens.highlightBg} onChange={(v) => update('highlightBg', v)} />
            </div>
          </div>

          {/* Shape */}
          <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.75rem' }}>Shape &amp; Spacing</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <RangeInput label="Card Radius" value={tokens.cardRadius} onChange={(v) => update('cardRadius', v)} min={0} max={1.5} step={0.125} unit="rem" />
              <RangeInput label="Card Padding" value={tokens.cardPadding} onChange={(v) => update('cardPadding', v)} min={0.5} max={2} step={0.125} unit="rem" />
              <RangeInput label="Border Width" value={tokens.borderWidth} onChange={(v) => update('borderWidth', v)} min={0} max={3} step={0.5} unit="px" />
            </div>
          </div>
        </div>

        {/* ── Preview Area ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Type specimen */}
          <div
            style={{
              background: tokens.bg,
              borderRadius: '0.75rem',
              border: '1px solid #e5e7eb',
              padding: '2rem',
              overflow: 'hidden',
            }}
          >
            <h2
              style={{
                fontFamily: tokens.headingFont,
                fontWeight: Number(tokens.headingWeight),
                fontSize: tokens.headingSize,
                letterSpacing: tokens.headingLetterSpacing,
                color: tokens.fg,
                marginBottom: '0.25rem',
              }}
            >
              Notifications
            </h2>
            <p style={{ fontFamily: tokens.bodyFont, fontSize: tokens.subheadingSize, color: tokens.muted, lineHeight: tokens.bodyLineHeight }}>
              42 notifications in the last 48 hours
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['All', 'Replies', 'Likes', 'Reposts', 'Quotes'].map((label, i) => (
                <span
                  key={label}
                  style={{
                    fontFamily: tokens.bodyFont,
                    fontSize: tokens.smallSize,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontWeight: 600,
                    background: i === 0 ? tokens.accent : `${tokens.accent}10`,
                    color: i === 0 ? tokens.accentFg : tokens.accent,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Header preview */}
          <div style={{ borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <PreviewHeader t={tokens} />
          </div>

          {/* Two-column layout preview */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1rem' }}>
            {/* Sidebar */}
            <div style={{ background: tokens.cardBg, borderRadius: tokens.cardRadius, border: `${tokens.borderWidth} solid ${tokens.border}`, padding: tokens.cardPadding }}>
              <PreviewSidebar t={tokens} />
            </div>

            {/* Notification stream */}
            <PreviewNotificationStream t={tokens} />
          </div>

          {/* Bookmarks + Followers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Bookmarks */}
            <div>
              <h3
                style={{
                  fontFamily: tokens.headingFont,
                  fontWeight: Number(tokens.headingWeight),
                  fontSize: tokens.subheadingSize,
                  letterSpacing: tokens.headingLetterSpacing,
                  color: tokens.fg,
                  marginBottom: '0.5rem',
                }}
              >
                Bookmarks
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <PreviewBookmarkTile t={tokens} author="Yolanda Gil" text="Excited to share our new paper on AI-assisted scientific discovery. We show that LLMs can help generate novel hypotheses when properly grounded..." tag="arXiv:2401.12345" />
                <PreviewBookmarkTile t={tokens} author="Percy Liang" text="Thread on evaluation methodology for language models — why current benchmarks may be insufficient for measuring real-world capabilities..." />
              </div>
            </div>

            {/* Followers */}
            <div>
              <h3
                style={{
                  fontFamily: tokens.headingFont,
                  fontWeight: Number(tokens.headingWeight),
                  fontSize: tokens.subheadingSize,
                  letterSpacing: tokens.headingLetterSpacing,
                  color: tokens.fg,
                  marginBottom: '0.5rem',
                }}
              >
                New Followers
              </h3>
              <div style={{ background: tokens.cardBg, borderRadius: tokens.cardRadius, border: `${tokens.borderWidth} solid ${tokens.border}`, overflow: 'hidden' }}>
                <PreviewFollowerRow t={tokens} name="Sarah Chen" handle="sarachen.bsky.social" mutual />
                <PreviewFollowerRow t={tokens} name="James Rivera" handle="jrivera.bsky.social" />
                <PreviewFollowerRow t={tokens} name="Priya Patel" handle="priyap.bsky.social" mutual />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
