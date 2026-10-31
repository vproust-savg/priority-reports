// ═══════════════════════════════════════════════════════════════
// FILE: client/src/App.tsx
// PURPOSE: Root component. Sets up QueryClient, Router, and routes.
//          Routes are auto-generated from departments + pages config.
// USED BY: main.tsx
// EXPORTS: App
// ═══════════════════════════════════════════════════════════════

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import DepartmentLayout from './components/DepartmentLayout';
import PageRenderer from './components/PageRenderer';
import NotFoundPage from './components/NotFoundPage';
import { departments } from './config/departments';
import { pages, firstVisiblePage } from './config/pages';

const queryClient = new QueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
          {/* WHY: No standalone root page — dashboard is always accessed via
              department URLs in Airtable iframe embeds. Redirect to first department. */}
          <Route path="/" element={<Navigate to={departments[0].basePath} replace />} />

          {/* WHY: Routes are generated from departments + pages config so adding
              a new department or page NEVER requires touching App.tsx. */}
          {departments.map((dept) => {
            const deptPages = pages.filter((p) => p.department === dept.id);
            const landingPage = firstVisiblePage(deptPages);
            return (
              <Route
                key={dept.id}
                path={dept.basePath}
                element={<DepartmentLayout department={dept} />}
              >
                {/* WHY: Guard against empty departments. If a department has no pages,
                    skip the index redirect (landingPage is undefined). Hidden pages never
                    win the redirect (firstVisiblePage). */}
                {landingPage && (
                  <Route
                    index
                    element={
                      /* WHY: Navigate uses relative path (no leading /) because this is
                         inside a nested route. '/receiving-log' would navigate to the app root,
                         'receiving-log' navigates relative to the department basePath. */
                      <Navigate to={landingPage.path.slice(1)} replace />
                    }
                  />
                )}
                {deptPages.map((page) => (
                  <Route
                    key={page.id}
                    path={page.path.slice(1)}
                    element={<PageRenderer page={page} />}
                  />
                ))}
                {/* WHY: Catch-all for invalid sub-paths within this department.
                    Without this, /food-safety/nonexistent renders DepartmentLayout
                    with an empty Outlet instead of a 404 message. */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            );
          })}

          {/* WHY: Catch-all for paths that don't match any department.
              React Router uses path="*" for splat routes (not /{*path} which is Express syntax). */}
          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
