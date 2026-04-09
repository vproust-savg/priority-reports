// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportSubTabs.tsx
// PURPOSE: Sub-tab bar for switching between Active and Extended
//          views within a report widget. Uses Framer Motion pill
//          indicator — same visual pattern as NavTabs.
// USED BY: ReportTableWidget
// EXPORTS: ReportSubTabs (default)
// ═══════════════════════════════════════════════════════════════

import { motion, LayoutGroup } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EASE_DEFAULT } from '../config/animationConstants';

interface ReportSubTabsProps {
  activeTab: 'active' | 'extended';
  onTabChange: (tab: 'active' | 'extended') => void;
  extendedCount?: number;
}

export default function ReportSubTabs({ activeTab, onTabChange, extendedCount }: ReportSubTabsProps) {
  const reduced = useReducedMotion();

  const tabs: Array<{ id: 'active' | 'extended'; label: string }> = [
    { id: 'active', label: 'Active' },
    { id: 'extended', label: 'Extended' },
  ];

  return (
    <LayoutGroup id="sub-tab-group">
      <div className="flex gap-1 overflow-x-auto px-5 py-2 border-b border-[var(--color-gold-subtle)]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { if (!isActive) onTabChange(tab.id); }}
              className={`relative py-2 px-3 text-sm whitespace-nowrap transition-colors duration-150 ${
                isActive ? 'font-semibold text-white' : 'font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sub-tab-indicator"
                  className="absolute inset-0 bg-[var(--color-dark)] rounded-[var(--radius-base)]"
                  transition={reduced ? { duration: 0 } : EASE_DEFAULT}
                  layout={!reduced}
                />
              )}
              <span className="relative z-10">
                {tab.label}
                {tab.id === 'extended' && extendedCount != null && extendedCount > 0 && (
                  <span className="font-normal text-[var(--color-text-secondary)]"> ({extendedCount})</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
