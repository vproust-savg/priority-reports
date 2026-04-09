// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/DepartmentLayout.tsx
// PURPOSE: Department-scoped shell — header with department name,
//          nav tabs filtered to current department, content outlet.
//          Each Airtable iframe embed loads a different department.
// USED BY: App.tsx (wraps department route groups)
// EXPORTS: DepartmentLayout
// ═══════════════════════════════════════════════════════════════

import { useLocation, Outlet } from 'react-router-dom';
import { pages } from '../config/pages';
import NavTabs from './NavTabs';
import type { DepartmentConfig } from '../config/departments';

interface DepartmentLayoutProps {
  department: DepartmentConfig;
}

export default function DepartmentLayout({ department }: DepartmentLayoutProps) {
  const location = useLocation();

  // WHY: Filter pages to this department, then map paths to full URLs
  // so NavTabs can compare against location.pathname for active state.
  const navPages = pages
    .filter((p) => p.department === department.id)
    .map((p) => ({ ...p, path: department.basePath + p.path }));

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      {/* Top bar */}
      <header className="bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]">
        <div className="max-w-[2400px] mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
              {department.name}
            </h1>
            {import.meta.env.DEV && (
              <span className="text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-gold-subtle)] px-2 py-1 rounded-md">
                DEV
              </span>
            )}
          </div>

          {/* Navigation tabs — filtered to current department */}
          <NavTabs pages={navPages} currentPath={location.pathname} />
        </div>
      </header>

      {/* Page content */}
      {/* WHY: No AnimatePresence here. The Navigate redirect in App.tsx
          (index route → first page) causes AnimatePresence mode="wait"
          to deadlock: exit animation never completes, blocking enter,
          leaving content permanently at opacity:0. NavTabs pill animation
          already provides visual continuity between pages. */}
      <main className="max-w-[2400px] mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
