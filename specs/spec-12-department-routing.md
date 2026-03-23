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

New config file `client/src/config/departments.ts` defines departments:

```typescript
export interface DepartmentConfig {
  id: string;        // URL-safe identifier (e.g., 'food-safety')
  name: string;      // Display name in header (e.g., 'Food Safety')
  basePath: string;  // URL prefix (e.g., '/food-safety')
}
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

```
<Routes>
  <Route path="/" element={<RootPage />} />

  {departments.map(dept => (
    <Route path={dept.basePath} element={<DepartmentLayout department={dept} />}>
      <Route index element={<Navigate to={firstPage.path.slice(1)} />} />
      {deptPages.map(page => (
        <Route path={page.path.slice(1)} element={<PageRenderer page={page} />} />
      ))}
    </Route>
  ))}
</Routes>
```

### 3. DepartmentLayout Replaces Layout

The current `Layout.tsx` component becomes `DepartmentLayout.tsx`. Changes:

| Aspect | Current (Layout.tsx) | New (DepartmentLayout.tsx) |
|--------|---------------------|---------------------------|
| Header text | "Dashboard" (hardcoded) | `department.name` (from prop) |
| Nav tabs | All pages | Only pages where `page.department === department.id` |
| Tab link URLs | `page.path` (e.g., `/receiving-log`) | `department.basePath + page.path` (e.g., `/food-safety/receiving-log`) |

Everything else (animation, DEV badge, max-width container) stays identical.

### 4. NavTabs Path Matching

`NavTabs.tsx` currently checks `currentPath === page.path` for active state. With department-prefixed URLs, the comparison needs to use the full path: `currentPath === department.basePath + page.path`.

The simplest approach: `DepartmentLayout` passes fully-qualified paths to `NavTabs`. NavTabs itself needs no logic change — it already compares `currentPath` against `page.path`. We just ensure `page.path` in the NavTabs props contains the full path.

**Approach:** `DepartmentLayout` maps pages to include full paths before passing to `NavTabs`:

```typescript
const navPages = deptPages.map(p => ({
  ...p,
  path: dept.basePath + p.path,  // '/food-safety' + '/receiving-log'
}));
```

### 5. Root URL Behavior

The root URL (`/`) shows a minimal, non-functional page. It is not meant to be embedded — it exists only as a fallback for direct browser access.

Content: a centered message like "Select a department" or a simple list of department links (for developer convenience). No widget rendering.

### 6. Invalid URL Handling

Any URL not matching a department or sub-page shows a minimal "Page not found" message. No redirect — keeps the iframe from jumping unexpectedly.

### 7. Backend: Zero Changes

The Express SPA catch-all (`/{*path}`) already serves `index.html` for any path. React Router handles all routing client-side. API routes are all under `/api/v1/` — completely unaffected.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `shared/types/widget.ts` | **Modify** | Add `DepartmentConfig` type, add `department: string` to `PageConfig` |
| `client/src/config/departments.ts` | **Create** | Department definitions array with Zod validation |
| `client/src/config/pages.ts` | **Modify** | Add `department` field to each page entry, update Zod schema |
| `client/src/App.tsx` | **Modify** | Generate nested routes per department instead of flat routes |
| `client/src/components/Layout.tsx` → `DepartmentLayout.tsx` | **Rename + Modify** | Accept department prop, show department name, filter pages |
| `client/src/components/NavTabs.tsx` | **No logic change** | Already receives pages + currentPath as props |
| `client/src/components/PageRenderer.tsx` | **No change** | Already receives a page and renders its widgets |

## Migration

### Current → New URL mapping

| Current URL | New URL |
|---|---|
| `/receiving-log` | `/food-safety/receiving-log` |
| `/purchasing-reports` | `/purchasing/bbd` |
| `/` (→ redirect to receiving-log) | `/` (→ blank root page) |

### No backwards-compatible redirects

This is an iframe embed, not a public SEO-indexed site. Old URLs can break cleanly. After deploy, update the Omni block URLs in Airtable to point to the new department paths.

## Adding a New Department (future)

1. Add entry to `client/src/config/departments.ts`
2. Add pages with `department: 'new-dept'` to `client/src/config/pages.ts`
3. Done — route, nav tabs, and header auto-generate

## Adding a New Page to an Existing Department (future)

1. Add page entry to `client/src/config/pages.ts` with `department: 'existing-dept'`
2. Done — tab appears automatically in that department's nav
