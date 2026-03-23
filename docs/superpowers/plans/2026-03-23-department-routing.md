# Department-Based URL Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `specs/spec-12-department-routing.md`

**Goal:** Give each department (Food Safety, Purchasing) its own URL path so they can be embedded as separate Airtable iframes, each showing only that department's sub-page tabs.

**Architecture:** A new `departments.ts` config defines departments. Each page in `pages.ts` gains a `department` field. `App.tsx` generates nested routes per department. `Layout.tsx` is renamed to `DepartmentLayout.tsx` and shows only the current department's name and pages. A minimal `RootPage.tsx` handles the `/` fallback. Backend: zero changes.

**Tech Stack:** React 19 + React Router v7 + Vite + Tailwind v4 + Framer Motion + Zod.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `client/src/config/departments.ts` | `DepartmentConfig` type + Zod-validated department definitions |
| `client/src/config/departments.test.ts` | Config validation tests for departments |
| `client/src/config/pages.test.ts` | Config validation tests for pages with department field |
| `client/src/components/NavTabs.test.tsx` | Active-state matching tests (exact match, trailing slash, similar prefix) |
| `client/src/components/RootPage.tsx` | Minimal fallback for `/` — centered message with department links |
| `client/src/components/NotFoundPage.tsx` | Minimal 404 page for invalid URLs — prevents blank white page in iframe |

### Modified Files

| File | What Changes |
|------|-------------|
| `shared/types/widget.ts:18-24` | Add `department: string` to `PageConfig` interface |
| `client/src/config/pages.ts:20-25,30-58` | Add `department` to Zod schema, add `department` field to each page entry, rename purchasing page id |
| `client/src/components/Layout.tsx` → `DepartmentLayout.tsx` | Rename via `git mv`, accept `department` prop, show `department.name` in header, filter + map pages for NavTabs |
| `client/src/components/NavTabs.tsx:27` | Add trailing-slash safety to active-state matching |
| `client/src/App.tsx:9-38` | Import `DepartmentLayout` + `departments` + `RootPage`, generate nested routes per department |

### Unchanged Files

| File | Why No Changes |
|------|---------------|
| `client/src/components/PageRenderer.tsx` | Already receives a page and renders its widgets — unaffected |
| `client/src/components/WidgetRenderer.tsx` | Already resolves widget type to component — unaffected |
| `server/` (all files) | Express SPA catch-all already serves `index.html` for any path. API routes under `/api/v1/` unaffected |

---

## Task 1: Add `department` to Shared Types

**Files:**
- Modify: `shared/types/widget.ts:18-24`

- [ ] **Step 1: Add `department` field to `PageConfig`**

In `shared/types/widget.ts`, add `department: string` to the `PageConfig` interface:

```typescript
export interface PageConfig {
  id: string;           // URL-safe page identifier (e.g., 'overview')
  department: string;   // Department this page belongs to (e.g., 'food-safety')
  name: string;         // Display name shown in navigation tabs
  path: string;         // URL path relative to department basePath (e.g., '/receiving-log')
  icon?: string;        // Lucide icon name (optional, for nav tabs)
  widgets: WidgetConfig[];
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/types/widget.ts
git commit -m "feat: add department field to PageConfig shared type"
```

---

## Task 2: Create Departments Config

**Files:**
- Create: `client/src/config/departments.ts`

- [ ] **Step 1: Create `departments.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/departments.ts
// PURPOSE: Defines available departments. Each department gets its own
//          URL path prefix and appears as a separate embeddable page.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: App.tsx (for route generation), DepartmentLayout.tsx
// EXPORTS: DepartmentConfig, departments
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const DepartmentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  basePath: z.string(),
});

export type DepartmentConfig = z.infer<typeof DepartmentConfigSchema>;

// WHY: Validate at import time. A typo in a department config crashes
// immediately with a clear Zod error instead of silently breaking routing.
export const departments = z.array(DepartmentConfigSchema).parse([
  { id: 'food-safety', name: 'Food Safety',        basePath: '/food-safety' },
  { id: 'purchasing',  name: 'Purchasing Reports',  basePath: '/purchasing' },
]);
```

- [ ] **Step 2: Commit**

```bash
git add client/src/config/departments.ts
git commit -m "feat: add departments config with Food Safety and Purchasing"
```

---

## Task 3: Update Pages Config

**Files:**
- Modify: `client/src/config/pages.ts:20-58`

- [ ] **Step 1: Add `department` to Zod schema and page entries**

Update `PageConfigSchema` to include `department`, then add `department` to each page entry. Also rename the purchasing page from `id: 'purchasing-reports'` to `id: 'bbd'` and simplify its path from `/purchasing-reports` to `/bbd` (the department now provides the "purchasing" context).

The full updated file:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.ts
// PURPOSE: Defines which widgets appear on which pages and in what layout.
//          This is the ONLY file you edit to rearrange the dashboard.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: DepartmentLayout.tsx (for nav tabs), PageRenderer (for widget grid)
// EXPORTS: pages
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const WidgetConfigSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  type: z.enum(['table']),  // WHY: Expand this enum as we add widget types
  title: z.string(),
  colSpan: z.number().min(1).max(12).default(12),
});

const PageConfigSchema = z.object({
  id: z.string(),
  department: z.string(),
  name: z.string(),
  path: z.string(),
  widgets: z.array(WidgetConfigSchema),
});

// WHY: Validate at import time. If someone adds a widget with a typo
// in the type field, the app fails immediately with a clear Zod error
// instead of silently rendering nothing.
export const pages = z.array(PageConfigSchema).parse([
  {
    id: 'receiving-log',
    department: 'food-safety',
    name: 'Receiving Log',
    path: '/receiving-log',
    widgets: [
      {
        id: 'grv-log',
        reportId: 'grv-log',
        type: 'table',
        title: 'GRV Log — Goods Receiving Vouchers',
        colSpan: 12,
      },
    ],
  },
  {
    id: 'bbd',
    department: 'purchasing',
    name: 'BBD — Best By Dates',
    path: '/bbd',
    widgets: [
      {
        id: 'bbd',
        reportId: 'bbd',
        type: 'table',
        title: 'BBD — Best By Dates',
        colSpan: 12,
      },
    ],
  },
]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc -b --noEmit
```

Expected: passes cleanly (no errors).

- [ ] **Step 3: Commit**

```bash
git add client/src/config/pages.ts
git commit -m "feat: add department field to page config, rename purchasing page to bbd"
```

---

## Task 4: Rename Layout to DepartmentLayout

**Files:**
- Rename + Modify: `client/src/components/Layout.tsx` → `client/src/components/DepartmentLayout.tsx`

- [ ] **Step 1: Rename via `git mv`**

```bash
cd client/src/components && git mv Layout.tsx DepartmentLayout.tsx
```

- [ ] **Step 2: Update `DepartmentLayout.tsx` content**

Replace the full file content. Key changes from original `Layout.tsx`:
- Import `departments` config instead of `pages` config
- Accept `department` prop (via route params or direct prop)
- Show `department.name` in header instead of "Dashboard"
- Filter pages by department, map to full paths before passing to NavTabs
- Update intent block

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Layout.tsx client/src/components/DepartmentLayout.tsx
git commit -m "feat: rename Layout to DepartmentLayout, show department name and filtered tabs"
```

---

## Task 5: Update NavTabs Active-State Matching

**Files:**
- Modify: `client/src/components/NavTabs.tsx:27`

- [ ] **Step 1: Update intent block USED BY reference**

Change `USED BY: Layout.tsx` to `USED BY: DepartmentLayout.tsx` in the file header.

- [ ] **Step 2: Add trailing-slash safety to active check**

Change line 27 to handle trailing slashes without false positives:

```typescript
// Before:
const isActive = currentPath === page.path;

// After:
// WHY: Exact match plus trailing-slash variant. Using startsWith would
// cause false positives (e.g., '/purchasing/bbd-archive' would match '/purchasing/bbd').
const isActive = currentPath === page.path || currentPath === page.path + '/';
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/NavTabs.tsx
git commit -m "fix: handle trailing slashes in NavTabs active state, update intent block"
```

---

## Task 6: Test Config Validation

**Files:**
- Create: `client/src/config/departments.test.ts`
- Create: `client/src/config/pages.test.ts`

- [ ] **Step 1: Write departments config tests**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/departments.test.ts
// PURPOSE: Validates department config integrity — unique IDs,
//          valid basePaths, and Zod schema correctness.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { departments } from './departments';

describe('departments config', () => {
  it('has at least one department', () => {
    expect(departments.length).toBeGreaterThan(0);
  });

  it('every department has unique id', () => {
    const ids = departments.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every basePath starts with /', () => {
    for (const dept of departments) {
      expect(dept.basePath).toMatch(/^\//);
    }
  });

  it('every basePath is unique', () => {
    const paths = departments.map((d) => d.basePath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
```

- [ ] **Step 2: Write pages config tests**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.test.ts
// PURPOSE: Validates page config integrity — every page references
//          a valid department, unique IDs, valid paths.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { pages } from './pages';
import { departments } from './departments';

describe('pages config', () => {
  it('has at least one page', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('every page has unique id', () => {
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every page references a valid department', () => {
    const deptIds = new Set(departments.map((d) => d.id));
    for (const page of pages) {
      expect(deptIds.has(page.department)).toBe(true);
    }
  });

  it('every page path starts with /', () => {
    for (const page of pages) {
      expect(page.path).toMatch(/^\//);
    }
  });

  it('every department has at least one page', () => {
    for (const dept of departments) {
      const deptPages = pages.filter((p) => p.department === dept.id);
      expect(deptPages.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client && npm test
```

Expected: all new tests pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/config/departments.test.ts client/src/config/pages.test.ts
git commit -m "test: add config validation tests for departments and pages"
```

---

## Task 7: Test NavTabs Active-State Matching

**Files:**
- Create: `client/src/components/NavTabs.test.tsx`

- [ ] **Step 1: Write NavTabs active-state tests**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NavTabs.test.tsx
// PURPOSE: Tests NavTabs active-state matching — exact match,
//          trailing slash, and similar-prefix false positive.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavTabs from './NavTabs';
import type { PageConfig } from '@shared/types';

const mockPages: PageConfig[] = [
  {
    id: 'bbd',
    department: 'purchasing',
    name: 'BBD',
    path: '/purchasing/bbd',
    widgets: [],
  },
  {
    id: 'bbd-archive',
    department: 'purchasing',
    name: 'BBD Archive',
    path: '/purchasing/bbd-archive',
    widgets: [],
  },
];

function renderNavTabs(currentPath: string) {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <NavTabs pages={mockPages} currentPath={currentPath} />
    </MemoryRouter>,
  );
}

describe('NavTabs active state', () => {
  it('highlights exact path match', () => {
    renderNavTabs('/purchasing/bbd');
    const link = screen.getByText('BBD').closest('a');
    expect(link?.className).toContain('text-primary');
  });

  it('highlights path with trailing slash', () => {
    renderNavTabs('/purchasing/bbd/');
    const link = screen.getByText('BBD').closest('a');
    expect(link?.className).toContain('text-primary');
  });

  it('does NOT highlight similar prefix path', () => {
    // '/purchasing/bbd-archive' should NOT highlight '/purchasing/bbd'
    renderNavTabs('/purchasing/bbd-archive');
    const bbdLink = screen.getByText('BBD').closest('a');
    expect(bbdLink?.className).not.toContain('text-primary');
    // But it SHOULD highlight 'BBD Archive'
    const archiveLink = screen.getByText('BBD Archive').closest('a');
    expect(archiveLink?.className).toContain('text-primary');
  });

  it('shows no active tab when path matches nothing', () => {
    renderNavTabs('/purchasing/nonexistent');
    const bbdLink = screen.getByText('BBD').closest('a');
    const archiveLink = screen.getByText('BBD Archive').closest('a');
    expect(bbdLink?.className).not.toContain('text-primary');
    expect(archiveLink?.className).not.toContain('text-primary');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd client && npm test
```

Expected: all new tests pass (the trailing-slash and similar-prefix tests validate the logic from Task 5).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/NavTabs.test.tsx
git commit -m "test: add NavTabs active-state matching tests (trailing slash, false positive)"
```

---

## Task 8: Create RootPage and NotFoundPage Components

**Files:**
- Create: `client/src/components/RootPage.tsx`
- Create: `client/src/components/NotFoundPage.tsx`

- [ ] **Step 1: Create minimal root fallback page**

```typescript
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
```

- [ ] **Step 2: Create 404 page**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NotFoundPage.tsx
// PURPOSE: Catch-all for invalid URLs. Prevents blank white page
//          in iframe embeds. No redirect — keeps iframe stable.
// USED BY: App.tsx (catch-all route)
// EXPORTS: NotFoundPage
// ═══════════════════════════════════════════════════════════════

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Page not found
        </h1>
        <p className="text-slate-500">
          This URL does not match any department or report.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/RootPage.tsx client/src/components/NotFoundPage.tsx
git commit -m "feat: add RootPage and NotFoundPage fallback components"
```

---

## Task 9: Update App.tsx with Nested Department Routes

**Files:**
- Modify: `client/src/App.tsx:1-38`

- [ ] **Step 1: Replace App.tsx with nested department routing**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/App.tsx
// PURPOSE: Root component. Sets up QueryClient, Router, and routes.
//          Routes are auto-generated from departments + pages config.
// USED BY: main.tsx
// EXPORTS: App
// ═══════════════════════════════════════════════════════════════

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DepartmentLayout from './components/DepartmentLayout';
import PageRenderer from './components/PageRenderer';
import RootPage from './components/RootPage';
import NotFoundPage from './components/NotFoundPage';
import { departments } from './config/departments';
import { pages } from './config/pages';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootPage />} />

          {/* WHY: Routes are generated from departments + pages config so adding
              a new department or page NEVER requires touching App.tsx. */}
          {departments.map((dept) => {
            const deptPages = pages.filter((p) => p.department === dept.id);
            return (
              <Route
                key={dept.id}
                path={dept.basePath}
                element={<DepartmentLayout department={dept} />}
              >
                {/* WHY: Guard against empty departments. If a department has no pages,
                    skip the index redirect to avoid runtime crash on deptPages[0]. */}
                {deptPages.length > 0 && (
                  <Route
                    index
                    element={
                      /* WHY: Navigate uses relative path (no leading /) because this is
                         inside a nested route. '/receiving-log' would navigate to the app root,
                         'receiving-log' navigates relative to the department basePath. */
                      <Navigate to={deptPages[0].path.slice(1)} replace />
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
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc -b --noEmit
```

Expected: passes cleanly.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: nested department routes with auto-generated sub-pages and 404 catch-all"
```

---

## Task 10: Verification

- [ ] **Step 1: Run full TypeScript check (client + server)**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

Expected: both pass cleanly.

- [ ] **Step 2: Start dev servers and verify routing**

Start both `npm run dev` in `server/` and `client/`. Then verify these URLs in the browser:

| URL | Expected Behavior |
|-----|-------------------|
| `http://localhost:5173/` | Shows "Priority Reports" with department links |
| `http://localhost:5173/food-safety` | Redirects to `/food-safety/receiving-log` |
| `http://localhost:5173/food-safety/receiving-log` | Shows Food Safety header + Receiving Log report |
| `http://localhost:5173/purchasing` | Redirects to `/purchasing/bbd` |
| `http://localhost:5173/purchasing/bbd` | Shows Purchasing Reports header + BBD report |
| `http://localhost:5173/nonexistent` | Shows "Page not found" message (not blank page) |
| `http://localhost:5173/food-safety/nonexistent` | Shows "Page not found" message (not blank page) |

Verify in each department:
- Header shows department name (not "Dashboard")
- Nav tabs show only that department's pages
- Active tab has the sliding pill indicator
- Page content renders correctly with widgets

- [ ] **Step 3: Verify no cross-department tab leakage**

On `/food-safety/receiving-log`: nav should show ONLY "Receiving Log" tab.
On `/purchasing/bbd`: nav should show ONLY "BBD — Best By Dates" tab.

No tab for the other department should be visible.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address verification issues for department routing"
```

Only create this commit if fixes were needed during verification. Skip if everything worked on first try.
