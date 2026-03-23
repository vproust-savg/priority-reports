// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/DepartmentLayout.tsx
// PURPOSE: Department-scoped shell — header with department name,
//          nav tabs filtered to current department, content outlet.
//          Each Airtable iframe embed loads a different department.
// USED BY: App.tsx (wraps department route groups)
// EXPORTS: DepartmentLayout
// ═══════════════════════════════════════════════════════════════

import { useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_SLIDE_UP, EASE_FAST, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';
import { pages } from '../config/pages';
import NavTabs from './NavTabs';
import type { DepartmentConfig } from '../config/departments';

interface DepartmentLayoutProps {
  department: DepartmentConfig;
}

export default function DepartmentLayout({ department }: DepartmentLayoutProps) {
  const location = useLocation();
  const reduced = useReducedMotion();

  // WHY: Filter pages to this department, then map paths to full URLs
  // so NavTabs can compare against location.pathname for active state.
  const navPages = pages
    .filter((p) => p.department === department.id)
    .map((p) => ({ ...p, path: department.basePath + p.path }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
              {department.name}
            </h1>
            {import.meta.env.DEV && (
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                DEV
              </span>
            )}
          </div>

          {/* Navigation tabs — filtered to current department */}
          <NavTabs pages={navPages} currentPath={location.pathname} />
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            {...(reduced ? REDUCED_FADE : FADE_SLIDE_UP)}
            transition={reduced ? REDUCED_TRANSITION : EASE_FAST}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
