# Spec 01 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project scaffolding, backend API with mock data, and frontend widget/page framework — producing a working dashboard with two demo pages and three table widgets.

**Architecture:** Monorepo with `server/` (Express + TypeScript), `client/` (React + Vite + Tailwind v4), and `shared/types/` (shared interfaces). The backend serves mock data through a standardized API envelope. The frontend renders widgets on configurable pages driven by a Zod-validated TypeScript config. Both sides share types via `@shared/` path alias.

**Tech Stack:** TypeScript (strict), Express, React 19, Vite, Tailwind CSS v4, TanStack Query v5, Zod, Upstash Redis (behind abstraction), Vitest

**Spec:** `specs/spec-01-foundation.md`

**Project root:** `/Users/victorproust/Documents/Work/SG Interface/Priority Reports/`

---

## File Map

### Root files (created by backend session)
| File | Responsibility |
|------|---------------|
| `.gitignore` | Exclude node_modules, dist, .env, .DS_Store |
| `.env.example` | Template for all environment variables |
| `railway.json` | Railway deployment config |
| `CLAUDE.md` | Already exists — backend session updates after build |

### `shared/types/` (created by backend session, consumed by both)
| File | Responsibility |
|------|---------------|
| `shared/types/api.ts` | ApiResponse, ColumnDefinition, PaginationMeta, ResponseMeta, HealthResponse |
| `shared/types/widget.ts` | WidgetConfig, PageConfig interfaces |
| `shared/types/index.ts` | Re-exports all types |

### `server/` (backend session)
| File | Responsibility |
|------|---------------|
| `server/package.json` | Dependencies + scripts |
| `server/tsconfig.json` | Strict TS + @shared path alias |
| `server/src/index.ts` | Express entry point, CORS, route mounting, static serving |
| `server/src/config/environment.ts` | Zod-validated env config |
| `server/src/services/cache.ts` | CacheProvider interface + Upstash + in-memory fallback |
| `server/src/services/mockData.ts` | Mock report data for demo widgets |
| `server/src/services/logger.ts` | Structured JSON logging |
| `server/src/routes/health.ts` | GET /api/v1/health |
| `server/src/routes/reports.ts` | GET /api/v1/reports/list, GET /:reportId, POST /:reportId/refresh |
| `server/vitest.config.ts` | Vitest config with @shared path alias |
| `server/tests/health.test.ts` | Health endpoint smoke test |

### `client/` (frontend session)
| File | Responsibility |
|------|---------------|
| `client/package.json` | Dependencies + scripts |
| `client/tsconfig.json` | Strict TS + @shared path alias |
| `client/vite.config.ts` | Vite + Tailwind v4 + proxy + alias |
| `client/index.html` | HTML entry point |
| `client/src/main.tsx` | React DOM render entry |
| `client/src/App.tsx` | QueryClient + Router + Layout + auto-generated routes |
| `client/src/index.css` | Tailwind v4 @theme + design tokens + scrollbar |
| `client/src/config/pages.ts` | Zod-validated page → widget config |
| `client/src/config/widgetRegistry.ts` | Widget type → component mapping |
| `client/src/components/Layout.tsx` | Top bar + auto-generated nav tabs + content outlet |
| `client/src/components/PageRenderer.tsx` | Reads page config, renders 12-col widget grid |
| `client/src/components/WidgetRenderer.tsx` | Resolves widget type from registry, wraps in shell |
| `client/src/components/WidgetShell.tsx` | Apple-style card wrapper (rounded-2xl, subtle shadow) |
| `client/src/components/widgets/DemoTableWidget.tsx` | Stripe-style table with formatted cells |
| `client/src/hooks/useReportQuery.ts` | TanStack Query wrapper for report fetching |
| `client/src/utils/formatters.ts` | Currency, date, number, percent formatters |

---

## Part A: Backend Session

### Task 1: Project scaffolding + root config files

**Files:**
- Create: `.gitignore`, `.env.example`, `railway.json`
- Create: `server/package.json`, `server/tsconfig.json`

- [ ] **Step 1: Initialize git repo**

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports"
git init
```

- [ ] **Step 2: Create root config files**

Create `.gitignore`:
```
node_modules/
dist/
.env
.DS_Store
*.log
```

Create `.env.example` (copy content from spec Section 8).

Create `railway.json` (copy content from spec Section 8).

- [ ] **Step 3: Initialize server package**

```bash
cd server
npm init -y
npm install express cors dotenv zod @upstash/redis axios
npm install -D typescript @types/express @types/cors @types/node tsx vitest supertest @types/supertest
```

- [ ] **Step 4: Create server/tsconfig.json**

Copy exact content from spec Section 5.1. Key settings: `strict: true`, `noImplicitAny: true`, `paths: { "@shared/*": ["../shared/*"] }`.

- [ ] **Step 5: Add scripts to server/package.json**

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example railway.json server/package.json server/tsconfig.json
git commit -m "feat: project scaffolding with server package and root configs"
```

---

### Task 2: Shared types

**Files:**
- Create: `shared/types/api.ts`, `shared/types/widget.ts`, `shared/types/index.ts`

- [ ] **Step 1: Create shared/types/api.ts**

Copy exact interfaces from spec Section 4: `ColumnDefinition`, `PaginationMeta`, `ResponseMeta`, `ApiResponse<T>`, `HealthResponse`. Include the intent block.

- [ ] **Step 2: Create shared/types/widget.ts**

Copy exact interfaces from spec Section 4: `WidgetConfig`, `PageConfig`. Include the intent block.

- [ ] **Step 3: Create shared/types/index.ts**

```typescript
export * from './api';
export * from './widget';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors (shared types should compile cleanly).

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "feat: add shared types — ApiResponse envelope, WidgetConfig, PageConfig"
```

---

### Task 3: Environment configuration

**Files:**
- Create: `server/src/config/environment.ts`

- [ ] **Step 1: Create server/src/config/environment.ts**

Copy from spec Section 5.2. Zod schema with `NODE_ENV`, `PORT`, all Priority env vars (optional for Spec 01), Upstash vars (optional). Include intent block.

- [ ] **Step 2: Create .env for local development**

```bash
cp .env.example .env
```

Set `NODE_ENV=development` and `PORT=3001`. Leave Priority and Upstash vars empty.

- [ ] **Step 3: Verify it parses without error**

```bash
cd server && npx tsx -e "import { env } from './src/config/environment'; console.log(env.NODE_ENV, env.PORT)"
```

Expected: `development 3001`

- [ ] **Step 4: Commit**

```bash
git add server/src/config/environment.ts
git commit -m "feat: add Zod-validated environment configuration"
```

---

### Task 4: Structured logger

**Files:**
- Create: `server/src/services/logger.ts`

- [ ] **Step 1: Create server/src/services/logger.ts**

Copy from spec Section 5.6. Export `logApiCall()` function that writes structured JSON to stdout. Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/logger.ts
git commit -m "feat: add structured JSON logger for Railway"
```

---

### Task 5: Cache abstraction layer

**Files:**
- Create: `server/src/services/cache.ts`

- [ ] **Step 1: Create server/src/services/cache.ts**

Include:
1. `CacheProvider` interface (get, set, invalidate, isConnected) — from spec Section 5.3
2. `buildCacheKey()` function — from spec Section 5.3
3. `UpstashCacheProvider` class implementing the interface using `@upstash/redis`
4. `InMemoryCacheProvider` class as fallback (uses a `Map` with TTL tracking)
5. `createCacheProvider()` factory that returns Upstash if env vars are set, otherwise InMemory with a warning log

All within 150 lines. Include intent block. Log warning on startup if falling back to in-memory.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/cache.ts
git commit -m "feat: add cache abstraction with Upstash + in-memory fallback"
```

---

### Task 6: Mock data service

**Files:**
- Create: `server/src/services/mockData.ts`

- [ ] **Step 1: Create server/src/services/mockData.ts**

Copy from spec Section 5.4. Two mock reports: `demo-sales-orders` (8 rows) and `demo-inventory` (6 rows). Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/mockData.ts
git commit -m "feat: add mock data service with sales orders and inventory demos"
```

---

### Task 7: Health route

**Files:**
- Create: `server/src/routes/health.ts`

- [ ] **Step 1: Create server/src/routes/health.ts**

Export an Express Router. `GET /` returns `HealthResponse` with status, environment, timestamp, cacheStatus (from cache.isConnected()), and version (from package.json). Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/health.ts
git commit -m "feat: add health check endpoint"
```

---

### Task 8: Reports route

**Files:**
- Create: `server/src/routes/reports.ts`

- [ ] **Step 1: Create server/src/routes/reports.ts**

Export an Express Router with three endpoints:

1. `GET /list` — returns `{ reports: [{ id, name }] }` from MOCK_REPORTS keys
2. `GET /:reportId` — validates query params with Zod → checks cache → gets mock data → caches result → returns `ApiResponse` envelope
3. `POST /:reportId/refresh` — invalidates cache key → re-fetches → returns fresh `ApiResponse`

Follow the exact handler pattern from spec Section 5.5. Use `buildCacheKey()`, `logApiCall()`. Handle 404 for unknown reportId. Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/reports.ts
git commit -m "feat: add reports API routes with cache + mock data"
```

---

### Task 9: Express server entry point

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Create server/src/index.ts**

Wire everything together:
- Import env config, cache provider, routes
- Express with CORS + JSON parsing
- Mount health at `/api/v1/health`, reports at `/api/v1/reports`
- Production static file serving from `../../client/dist` with SPA catch-all
- Log startup: port, environment, cache status
- Include intent block

- [ ] **Step 2: Start the server and test all endpoints**

```bash
cd server && npm run dev
```

In a separate terminal:
```bash
curl http://localhost:3001/api/v1/health
curl http://localhost:3001/api/v1/reports/list
curl http://localhost:3001/api/v1/reports/demo-sales-orders
curl http://localhost:3001/api/v1/reports/demo-inventory
curl http://localhost:3001/api/v1/reports/nonexistent
```

Expected:
- Health: `{ "status": "ok", "environment": "development", "cacheStatus": "connected" or "disconnected", ... }`
- List: returns two report IDs
- Sales orders: returns `ApiResponse` with 8 rows, 5 columns, `meta.source: "mock"`
- Inventory: returns `ApiResponse` with 6 rows, 5 columns
- Nonexistent: returns 404

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: wire up Express server with health + reports routes"
```

---

### Task 10: Backend smoke test

**Files:**
- Create: `server/tests/health.test.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, '../shared') },
  },
  test: { globals: true },
});
```

WHY: Vitest needs the `@shared/*` path alias that mirrors `tsconfig.json` so tests can import shared types.

- [ ] **Step 2: Export Express app separately from server listen**

In `server/src/index.ts`, refactor so that `app` is exported and `app.listen()` only runs when the file is executed directly (not imported by tests). This allows `supertest` to import the app without starting the server.

```typescript
// At bottom of index.ts:
export { app };
if (require.main === module) {
  app.listen(env.PORT, () => { /* log startup */ });
}
```

- [ ] **Step 3: Write health endpoint test**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';

describe('GET /api/v1/health', () => {
  it('returns 200 with expected fields', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('cacheStatus');
    expect(res.body).toHaveProperty('version');
  });
});
```

- [ ] **Step 4: Run test**

```bash
cd server && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/vitest.config.ts server/tests/ server/src/index.ts
git commit -m "test: add health endpoint smoke test"
```

---

## Part B: Frontend Session

> **Prerequisite:** Backend session must be complete (shared/types/ must exist, server must run on port 3001).

### Task 11: Vite + React + Tailwind scaffolding

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/client"
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @tanstack/react-query react-router-dom lucide-react zod
npm install -D tailwindcss @tailwindcss/vite @types/node
```

- [ ] **Step 3: Configure vite.config.ts**

Copy from spec Section 6.1. Key: `@shared` alias pointing to `../shared`, `/api` proxy to `http://localhost:3001`, `@tailwindcss/vite` plugin.

- [ ] **Step 4: Update tsconfig.json**

Add `@shared/*` path mapping to `../shared/*` paths. Ensure `strict: true`.

- [ ] **Step 5: Remove Vite boilerplate**

Delete default `App.css`, `assets/`, and boilerplate content from `App.tsx` and `main.tsx`. Keep the entry points clean.

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite starts on port 5173, shows blank page.

- [ ] **Step 7: Commit**

```bash
git add client/
git commit -m "feat: scaffold Vite + React + Tailwind v4 frontend"
```

---

### Task 12: Design tokens + global styles

**Files:**
- Create: `client/src/index.css`

- [ ] **Step 1: Create client/src/index.css**

Copy from spec Section 6.2. Key elements:
- `@import "tailwindcss"`
- `@theme` with `--font-sans` (Apple system font stack) and `--color-primary: #007AFF`
- Custom scrollbar styles
- `.tabular-nums` utility class

- [ ] **Step 2: Verify Tailwind compiles**

Restart dev server, confirm no CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add Apple/Stripe design tokens and global styles"
```

---

### Task 13: Utility formatters

**Files:**
- Create: `client/src/utils/formatters.ts`

- [ ] **Step 1: Create client/src/utils/formatters.ts**

Implement all formatters from spec Section 6.8:
- `formatCurrency(num)` → `$15,420.50`, negatives as `($1,234.00)`
- `formatNumber(num)` → `1,234,567`
- `formatDate(dateStr)` → `Mar 15, 2026`
- `formatPercent(num)` → `+15.3%`
- `formatCellValue(value, columnType)` → dispatches to correct formatter

Use `Intl.NumberFormat` and `Intl.DateTimeFormat`. Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/utils/formatters.ts
git commit -m "feat: add currency, date, number formatters"
```

---

### Task 14: useReportQuery hook

**Files:**
- Create: `client/src/hooks/useReportQuery.ts`

- [ ] **Step 1: Create client/src/hooks/useReportQuery.ts**

Copy from spec Section 6.7. TanStack Query wrapper that fetches from `/api/v1/reports/:reportId` with page/pageSize/from/to params. `staleTime: 5 * 60 * 1000`. Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useReportQuery.ts
git commit -m "feat: add useReportQuery TanStack Query hook"
```

---

### Task 15: Page configuration

**Files:**
- Create: `client/src/config/pages.ts`

WHY: `widgetRegistry.ts` is created in Task 17 (after DemoTableWidget exists in Task 16). Only `pages.ts` goes here because it has no component imports.

- [ ] **Step 1: Create client/src/config/pages.ts**

Copy from spec Section 6.4. Zod schemas + two demo pages (Overview with 2 widgets, Sales with 1 widget). Include intent block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/config/pages.ts
git commit -m "feat: add Zod-validated page/widget configuration"
```

---

### Task 16: Widget components (WidgetShell + DemoTableWidget)

**Files:**
- Create: `client/src/components/WidgetShell.tsx`, `client/src/components/widgets/DemoTableWidget.tsx`

- [ ] **Step 1: Create client/src/components/WidgetShell.tsx**

Apple-style card wrapper per spec Section 6.5:
- `bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Hover: `shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200`
- Header with title (14px font-semibold text-slate-600) + border-b
- Children slot for widget content
- Include intent block

- [ ] **Step 2: Create client/src/components/widgets/DemoTableWidget.tsx**

Stripe-style table per spec Section 6.6:
- Calls `useReportQuery(reportId)` to fetch data
- Renders `<table>` with columns as headers and data as rows
- Formats cells via `formatCellValue()`
- Table styling: no cell borders, `border-b border-slate-100`, header `text-xs uppercase tracking-wider`, alternating rows `bg-slate-50/30`, currency right-aligned with `tabular-nums`
- Loading state: "Loading..." centered text
- Error state: red-tinted card with retry button
- Empty state: "No data available" centered
- Include intent block

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/WidgetShell.tsx client/src/components/widgets/DemoTableWidget.tsx
git commit -m "feat: add WidgetShell card wrapper and DemoTableWidget"
```

---

### Task 17: Widget registry + renderers

**Files:**
- Create: `client/src/config/widgetRegistry.ts`, `client/src/components/WidgetRenderer.tsx`, `client/src/components/PageRenderer.tsx`

- [ ] **Step 1: Create client/src/config/widgetRegistry.ts**

Copy from spec Section 6.5. Map `table` → `DemoTableWidget`. Export `WidgetProps` interface. Include intent block.

- [ ] **Step 2: Create client/src/components/WidgetRenderer.tsx**

Resolves widget type from registry, wraps component in WidgetShell. Shows error card for unknown types. Include intent block.

- [ ] **Step 3: Create client/src/components/PageRenderer.tsx**

Renders 12-column grid. Uses `COL_SPAN_CLASSES` map for Tailwind-safe dynamic classes. Maps each widget config to `<WidgetRenderer />` in a grid cell. Responsive: `grid-cols-1 lg:grid-cols-12`. Include intent block.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/config/widgetRegistry.ts client/src/components/WidgetRenderer.tsx client/src/components/PageRenderer.tsx
git commit -m "feat: add widget registry, WidgetRenderer, and PageRenderer"
```

---

### Task 18: Layout shell

**Files:**
- Create: `client/src/components/Layout.tsx`

- [ ] **Step 1: Create client/src/components/Layout.tsx**

Per spec Section 6.3:
- Top bar: `bg-white border-b border-slate-200/60`
- Dashboard title: 28px weight-700 tracking-tight text-slate-900
- Navigation tabs auto-generated from `pages` config
- Active tab: `border-b-2` with Apple blue (`#007AFF`), determined by `useLocation()`
- Content area: `bg-slate-50 min-h-screen p-6`
- `<Outlet />` for route content
- Include intent block

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Layout.tsx
git commit -m "feat: add Layout shell with auto-generated navigation tabs"
```

---

### Task 19: App entry point + routing

**Files:**
- Modify: `client/src/App.tsx`, `client/src/main.tsx`

- [ ] **Step 1: Create client/src/App.tsx**

Per spec Section 6.9:
- `QueryClientProvider` wrapping everything
- `BrowserRouter` with `Layout` as parent route
- `Route path="/"` redirects to `/overview`
- Auto-generate routes from `pages` config → `<PageRenderer page={page} />`
- Include intent block

- [ ] **Step 2: Update client/src/main.tsx**

Clean entry point: renders `<App />` into `#root`. Import `index.css`.

- [ ] **Step 3: Start both servers and verify end-to-end**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
cd client && npm run dev
```

Open `http://localhost:5173` in browser.

Expected:
- Redirects to `/overview`
- Shows two navigation tabs: "Overview" and "Sales"
- Overview page shows two table widgets: "Recent Sales Orders" (8 rows) and "Inventory Levels" (6 rows)
- Click "Sales" tab → shows one table widget with sales data
- Tables have formatted currency ($15,420.50), dates (Mar 15, 2026)
- Cards have Apple-style rounded corners and subtle shadows
- Page background is off-white (slate-50)

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/main.tsx
git commit -m "feat: wire up App with QueryClient, Router, and auto-generated routes"
```

---

### Task 20: Verification + final commit

- [ ] **Step 1: Verify acceptance criteria**

Run through all acceptance criteria from spec Section 10:

Backend:
- [ ] `server/` runs on port 3001
- [ ] `GET /api/v1/health` returns correct shape
- [ ] `GET /api/v1/reports/list` returns report list
- [ ] `GET /api/v1/reports/demo-sales-orders` returns ApiResponse
- [ ] `GET /api/v1/reports/demo-inventory` returns ApiResponse
- [ ] Cache abstraction exists
- [ ] All files have intent blocks and are under 150 lines

Frontend:
- [ ] `client/` runs on port 5173
- [ ] `/` redirects to `/overview`
- [ ] Overview shows 2 table widgets
- [ ] Sales shows 1 table widget
- [ ] Nav tabs auto-generated and switch pages
- [ ] Tables show formatted currency and dates
- [ ] Page bg is slate-50, cards are white with rounded-2xl

- [ ] **Step 2: Run server tests**

```bash
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Verify CLAUDE.md exists and is current**

The CLAUDE.md at the project root should already exist (created during brainstorming). Review it against spec Section 7 and update if any commands, file paths, or design tokens are out of date after the build.

- [ ] **Step 4: Verify all files have intent blocks**

```bash
grep -rL "PURPOSE:" server/src/ shared/ client/src/ --include="*.ts" --include="*.tsx"
```

Expected: no files listed (all have intent blocks).

- [ ] **Step 5: Verify no file exceeds 150 lines**

```bash
find server/src client/src shared -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -n
```

Expected: all files under 150 lines.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Spec 01 foundation complete — monorepo with widget/page framework and mock data"
```
