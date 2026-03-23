// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/RootPage.tsx
// PURPOSE: Fallback page for the root URL (/). Not meant to be
//          embedded — exists only for direct browser access.
//          Shows department links for developer convenience.
// USED BY: App.tsx (root route)
// EXPORTS: RootPage
// ═══════════════════════════════════════════════════════════════

import { Link } from 'react-router-dom';
import { departments } from '../config/departments';

export default function RootPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">
          Priority Reports
        </h1>
        <p className="text-slate-500 mb-6">Select a department</p>
        <div className="flex flex-col gap-2">
          {departments.map((dept) => (
            <Link
              key={dept.id}
              to={dept.basePath}
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {dept.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
