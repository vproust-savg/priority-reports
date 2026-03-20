// ═══════════════════════════════════════════════════════════════
// FILE: client/src/App.tsx
// PURPOSE: Root component. Sets up QueryClient, Router, and routes.
//          Routes are auto-generated from pages config.
// USED BY: main.tsx
// EXPORTS: App
// ═══════════════════════════════════════════════════════════════

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PageRenderer from './components/PageRenderer';
import { pages } from './config/pages';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/qc" replace />} />
            {/* WHY: Routes are generated from pages config so adding a new page
                NEVER requires touching App.tsx — just add to config/pages.ts. */}
            {pages.map((page) => (
              <Route
                key={page.id}
                path={page.path}
                element={<PageRenderer page={page} />}
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
