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
      <div className="flex overflow-x-auto px-5 pt-2 pb-0 border-b border-slate-100">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { if (!isActive) onTabChange(tab.id); }}
              className={`relative pb-2 pr-4 text-sm whitespace-nowrap transition-colors duration-150 ${
                isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sub-tab-indicator"
                  className="absolute inset-0 bottom-1 bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  transition={reduced ? { duration: 0 } : EASE_DEFAULT}
                  layout={!reduced}
                />
              )}
              <span className="relative z-10">
                {tab.label}
                {tab.id === 'extended' && extendedCount != null && extendedCount > 0 && (
                  <span className="font-normal text-slate-500"> ({extendedCount})</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
