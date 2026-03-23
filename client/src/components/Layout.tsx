// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Layout.tsx
// PURPOSE: Application shell — top bar with nav tabs + content area.
//          Reads page config to auto-generate navigation tabs.
// USED BY: App.tsx (wraps all routes)
// EXPORTS: Layout
// ═══════════════════════════════════════════════════════════════

import { useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_SLIDE_UP, EASE_FAST, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';
import { pages } from '../config/pages';
import NavTabs from './NavTabs';

export default function Layout() {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            {import.meta.env.DEV && (
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                DEV
              </span>
            )}
          </div>

          {/* Navigation tabs — auto-generated from pages config */}
          <NavTabs pages={pages} currentPath={location.pathname} />
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
