'use client';

import { useMemo } from 'react';
import { Label } from '@/lib/bluesky';
import { useModeration } from '@/lib/moderation';

// Known label definitions for common labelers
// These provide human-readable names for common label values
const KNOWN_LABELS: Record<string, { name: string; severity: 'info' | 'warn' | 'alert'; color: string }> = {
  // Bluesky built-in labels
  'porn': { name: 'Adult Content', severity: 'warn', color: 'red' },
  'sexual': { name: 'Sexually Suggestive', severity: 'warn', color: 'orange' },
  'nudity': { name: 'Nudity', severity: 'warn', color: 'orange' },
  'nsfl': { name: 'NSFL', severity: 'alert', color: 'red' },
  'gore': { name: 'Gore', severity: 'alert', color: 'red' },
  'graphic-media': { name: 'Graphic Media', severity: 'warn', color: 'orange' },
  'spam': { name: 'Spam', severity: 'alert', color: 'gray' },
  'impersonation': { name: 'Impersonation', severity: 'alert', color: 'red' },
  'scam': { name: 'Scam', severity: 'alert', color: 'red' },
  // Common community labels
  'ai-generated': { name: 'AI Generated', severity: 'info', color: 'purple' },
  'satire': { name: 'Satire', severity: 'info', color: 'blue' },
  'misleading': { name: 'Misleading', severity: 'warn', color: 'amber' },
  'misinformation': { name: 'Misinformation', severity: 'alert', color: 'red' },
  'hate': { name: 'Hate', severity: 'alert', color: 'red' },
  'harassment': { name: 'Harassment', severity: 'alert', color: 'red' },
  // LEA verified researcher label (special handling)
  'verified-researcher': { name: 'Verified Researcher', severity: 'info', color: 'emerald' },
};

// Labels we don't want to show (internal/system labels)
const HIDDEN_LABELS = new Set([
  '!hide', '!warn', '!no-unauthenticated', '!no-promote',
  'verified-researcher', // We show this differently
]);

// Labeler DID to name mapping for common labelers
const KNOWN_LABELERS: Record<string, string> = {
  'did:plc:ar7c4by46qjdydhdevvrndac': 'Bluesky',
  'did:plc:7c7tx56n64jhzezlwox5dja6': 'Lea',
};

interface LabelBadgesProps {
  labels?: Label[];
  // If true, show in a more compact form
  compact?: boolean;
  // If true, show the labeler source
  showSource?: boolean;
}

export default function LabelBadges({ labels, compact = false, showSource = false }: LabelBadgesProps) {
  const { getLabelDisplayName } = useModeration();
  
  // Filter and dedupe labels
  const displayLabels = useMemo(() => {
    if (!labels || labels.length === 0) return [];
    
    const seen = new Set<string>();
    const result: Array<{ val: string; src: string; name: string; severity: 'info' | 'warn' | 'alert'; color: string }> = [];
    
    for (const label of labels) {
      // Skip hidden/internal labels
      if (HIDDEN_LABELS.has(label.val)) continue;
      
      // Skip if we've already seen this label value
      const key = `${label.val}:${label.src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      // Get label info - first check labeler definitions, then known labels, then format
      const known = KNOWN_LABELS[label.val];
      const labelerDefinedName = getLabelDisplayName(label.val, label.src);
      
      result.push({
        val: label.val,
        src: label.src,
        name: labelerDefinedName || known?.name || formatLabelName(label.val),
        severity: known?.severity || 'info',
        color: known?.color || 'gray',
      });
    }
    
    return result;
  }, [labels, getLabelDisplayName]);

  if (displayLabels.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'mt-1'}`}>
      {displayLabels.map((label, i) => (
        <LabelBadge
          key={`${label.val}-${label.src}-${i}`}
          label={label}
          compact={compact}
          showSource={showSource}
        />
      ))}
    </div>
  );
}

function LabelBadge({
  label,
  compact,
  showSource,
}: {
  label: { val: string; src: string; name: string; severity: 'info' | 'warn' | 'alert'; color: string };
  compact: boolean;
  showSource: boolean;
}) {
  const labelerName = KNOWN_LABELERS[label.src] || 'Labeler';
  
  // Color classes based on severity/color
  const colorClasses = getColorClasses(label.color, label.severity);
  
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${colorClasses} ${
        compact ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'
      }`}
      title={showSource ? `Labeled by ${labelerName}` : label.name}
    >
      {label.severity === 'alert' && (
        <svg className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )}
      {label.severity === 'warn' && (
        <svg className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )}
      <span>{label.name}</span>
      {showSource && !compact && (
        <span className="opacity-60 text-[10px]">({labelerName})</span>
      )}
    </span>
  );
}

function getColorClasses(color: string, severity: 'info' | 'warn' | 'alert'): string {
  switch (color) {
    case 'red':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
    case 'orange':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
    case 'amber':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    case 'yellow':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
    case 'green':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    case 'emerald':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
    case 'blue':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    case 'purple':
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
    case 'gray':
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  }
}

// Convert label value like "ai-generated" to "AI Generated"
function formatLabelName(val: string): string {
  return val
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
