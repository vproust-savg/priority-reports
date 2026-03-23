# Spec 12 — Department-Based URL Routing

## Problem

The dashboard is a single SPA where all pages (Receiving Log, BBD) share one URL root. Every Airtable Omni iframe sees the same nav bar with all pages visible. There is no way to embed only Purchasing reports or only Food Safety reports — the iframe always shows everything.

## Goal

Each department (Food Safety, Purchasing, Sales, AR, AP, etc.) gets its own URL path that can be embedded as a separate Airtable iframe. Each department shows only its own sub-page tabs. Future departments can be added by editing config files — no component code changes.

## URL Structure

```
/food-safety                    → redirects to /food-safety/receiving-log
/food-safety/receiving-log      → Receiving Log report

/purchasing                     → redirects to /purchasing/bbd
/purchasing/bbd                 → BBD report

/                               → minimal "no department selected" message
```

Airtable Omni blocks point to department paths:
- Food Safety embed: `https://priority-reports-production.up.railway.app/food-safety`
- Purchasing embed: `https://priority-reports-production.up.railway.app/purchasing`

## Design Decisions

### 1. Config-Driven Departments

New config file `client/src/config/departments.ts` defines departments.

**`DepartmentConfig` is client-only** — the backend never uses it. Define the interface and Zod schema in `departments.ts`, not in `shared/types/`.

```typescript
// client/src/config/departments.ts
import { z } from 'zod';

const DepartmentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  basePath: z.string(),
});

export type DepartmentConfig = z.infer<typeof DepartmentConfigSchema>;

export const departments = z.array(DepartmentConfigSchema).parse([
  { id: 'food-safety', name: 'Food Safety',         basePath: '/food-safety' },
  { id: 'purchasing',  name: 'Purchasing Reports',  basePath: '/purchasing' },
]);
```

Each page in `pages.ts` gains a `department` field that links it to a department:

```typescript
// pages.ts
{
  id: 'receiving-log',
  department: 'food-safety',    // ← NEW: links to department.id
  name: 'Receiving Log',
  path: '/receiving-log',       // ← relative to department basePath
  widgets: [...]
}
```

The full URL is built automatically: `department.basePath + page.path` → `/food-safety/receiving-log`.

### 2. Nested Routes Per Department

`App.tsx` generates a route group per department. Each department wraps its sub-pages in a `DepartmentLayout` that provides the header, nav tabs, and outlet.

```tsx
<Routes>
  <Route path="/" element={<RootPage />} />

  {departments.map(dept => {
    const deptPages = pages.filter(p => p.department === dept.id);
    return (
      <Route key={dept.id} path={dept.basePath} element={<DepartmentLayout department={dept} />}>
        {/* WHY: Navigate uses relative path (no leading /) because this is
            inside a nested route. '/receiving-log' would navigate to the root,
            'receiving-log' navigates relative to the department basePath. */}
        <Route index element={<Navigate to={deptPages[0].path.slice(1)} replace />} />
        {deptPages.map(page => (
          <Route key={page.id} path={page.path.slice(1)} element={<PageRenderer page={page} />} />
        ))}
      </Route>
    );
  })}
</Routes>
```

### 3. DepartmentLayout Replaces Layout

The current `Layout.tsx` is renamed to `DepartmentLayout.tsx` via `git mv` (preserves file history). `App.tsx` import changes from `import Layout from './components/Layout'` to `import DepartmentLayout from './components/DepartmentLayout'`.

Changes:

| Aspect | Current (Layout.tsx) | New (DepartmentLayout.tsx) |
|--------|---------------------|---------------------------|
| Header text | "Dashboard" (hardcoded) | `department.name` (from prop) |
| Nav tabs | All pages | Only pages where `page.department === department.id` |
| Tab link URLs | `page.path` (e.g., `/receiving-log`) | `department.basePath + page.path` (e.g., `/food-safety/receiving-log`) |

Everything else (animation, DEV badge, max-width container) stays identical.

### 4. NavTabs Path Matching

`NavTabs.tsx` currently checks `currentPath === page.path` for active state. With department-prefixed URLs, the comparison needs to use the full path.

**Approach:** `DepartmentLayout` maps pages to include full paths before passing to `NavTabs`:

```typescript
const navPages = deptPages.map(p => ({
  ...p,
  path: dept.basePath + p.path,  // '/food-safety' + '/receiving-log'
}));
```

NavTabs itself needs no logic change — it already compares `currentPath` against `page.path`.

**Trailing-slash safety:** `NavTabs` uses exact equality (`currentPath === page.path`). React Router v7 may produce paths with or without trailing slashes. The implementer should verify this works, or switch the active check to use `location.pathname.startsWith(page.path)` or React Router's `NavLink` component (which handles active state natively) for robustness.

### 5. Root URL Behavior

The root URL (`/`) shows a minimal, non-functional page. It is not meant to be embedded — it exists only as a fallback for direct browser access.

Content: a centered message like "Select a department" or a simple list of department links (for developer convenience). No widget rendering.

### 6. Invalid URL Handling

Any URL not matching a department or sub-page shows a minimal "Page not found" message. No redirect — keeps the iframe from jumping unexpectedly.

### 7. PageRenderer Page Title

`PageRenderer.tsx` renders an `<h2>` with `page.name` (e.g., "Receiving Log"). This stays as-is. With the department name in the header and the page name below it, the hierarchy is clear: "Food Safety" (header) → "Receiving Log" (page title). When a department has only one page, the page title still shows — it provides context for what the report is.

### 8. Backend: Zero Changes

The Express SPA catch-all (`/{*path}`) already serves `index.html` for any path. React Router handles all routing client-side. API routes are all under `/api/v1/` — completely unaffected.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `shared/types/widget.ts` | **Modify** | Add `department: string` to `PageConfig` (no `DepartmentConfig` here — it's client-only) |
| `client/src/config/departments.ts` | **Create** | `DepartmentConfig` type + department definitions array with Zod validation |
| `client/src/config/pages.ts` | **Modify** | Add `department` field to each page entry, update Zod schema |
| `client/src/App.tsx` | **Modify** | Import `DepartmentLayout` + `departments`, generate nested routes per department |
| `client/src/components/Layout.tsx` → `DepartmentLayout.tsx` | **Rename (`git mv`) + Modify** | Accept `department` prop, show `department.name` in header, filter pages by department |
| `client/src/components/RootPage.tsx` | **Create** | Minimal fallback for `/` — centered message with department links for dev convenience |
| `client/src/components/NavTabs.tsx` | **No logic change** | Already receives pages + currentPath as props. Verify trailing-slash behavior. |
| `client/src/components/PageRenderer.tsx` | **No change** | Already receives a page and renders its widgets |

## Migration

### Current → New mapping

| Current | New | Notes |
|---|---|---|
| Page id: `purchasing-reports`, path: `/purchasing-reports` | Page id: `bbd`, path: `/bbd` | Simplified — department provides "purchasing" context |
| Page id: `receiving-log`, path: `/receiving-log` | Page id: `receiving-log`, path: `/receiving-log` | Unchanged — just gains `department: 'food-safety'` |
| `/` → redirect to `/receiving-log` | `/` → blank root page | Root no longer redirects |

Full URL mapping:

| Current URL | New URL |
|---|---|
| `/receiving-log` | `/food-safety/receiving-log` |
| `/purchasing-reports` | `/purchasing/bbd` |

### No backwards-compatible redirects

This is an iframe embed, not a public SEO-indexed site. Old URLs can break cleanly. After deploy, update the Omni block URLs in Airtable to point to the new department paths.

## Adding a New Department (future)

1. Add entry to `client/src/config/departments.ts`
2. Add pages with `department: 'new-dept'` to `client/src/config/pages.ts`
3. Done — route, nav tabs, and header auto-generate

## Adding a New Page to an Existing Department (future)

1. Add page entry to `client/src/config/pages.ts` with `department: 'existing-dept'`
2. Done — tab appears automatically in that department's nav
