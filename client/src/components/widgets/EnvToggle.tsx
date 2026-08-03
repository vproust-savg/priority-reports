// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/EnvToggle.tsx
// PURPOSE: Live/UAT segmented control for the GRV widget toolbar.
//          UAT mode is deliberately loud (amber pill + "test data"
//          badge) so nobody mistakes test data for live receiving
//          records inside the Airtable iframe.
// USED BY: TableToolbar.tsx (rendered when the widget sets envToggle)
// EXPORTS: EnvToggle (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import type { PriorityEnvironment } from '@shared/types';

interface EnvToggleProps {
  value: PriorityEnvironment;
  onChange: (env: PriorityEnvironment) => void;
}

const SEGMENTS: { env: PriorityEnvironment; label: string }[] = [
  { env: 'production', label: 'Live' },
  { env: 'uat', label: 'UAT' },
];

export default function EnvToggle({ value, onChange }: EnvToggleProps) {
  const isUat = value === 'uat';

  return (
    <div className="flex items-center gap-2">
      {/* WHY: amber-700 on amber-50 — passes the iframe/JPEG visibility rule
          (slate-300/400 washes out in the Airtable embed). */}
      {isUat && (
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          UAT — test data
        </span>
      )}
      <div
        role="group"
        aria-label="Priority environment"
        className={`flex h-7 items-center rounded-full border p-0.5 text-[11px] font-medium ${
          isUat ? 'border-amber-400' : 'border-[var(--color-gold-subtle)]'
        }`}
      >
        {SEGMENTS.map(({ env, label }) => {
          const active = value === env;
          return (
            <button
              key={env}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(env)}
              className={`relative h-6 rounded-full px-2.5 transition-colors duration-150 ${
                active
                  ? 'text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="env-toggle-pill"
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className={`absolute inset-0 -z-10 rounded-full ${
                    env === 'uat' ? 'bg-amber-600' : 'bg-[var(--color-gold-primary)]'
                  }`}
                />
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
