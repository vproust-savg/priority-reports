// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Layout.tsx
// PURPOSE: Application shell — top bar with nav tabs + content area.
//          Reads page config to auto-generate navigation tabs.
// USED BY: App.tsx (wraps all routes)
// EXPORTS: Layout
// ═══════════════════════════════════════════════════════════════

import { Link, useLocation, Outlet } from 'react-router-dom';
import { pages } from '../config/pages';

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
              DEV
            </span>
          </div>

          {/* Navigation tabs — auto-generated from pages config */}
          <nav className="flex gap-6 -mb-px">
            {pages.map((page) => {
              const isActive = location.pathname === page.path;
              return (
                <Link
                  key={page.id}
                  to={page.path}
                  className={`pb-3 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {page.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
