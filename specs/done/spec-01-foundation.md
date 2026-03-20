# Spec 01 — Foundation: Project Scaffolding + Widget/Page Framework

> **Session scope:** ~1 hour total Claude Code work (split across backend + frontend sessions)
> **Date:** 2026-03-20
> **Status:** Ready to build

---

## 1. Overview

### 1.1 What We're Building

A production-grade web dashboard that visualizes data from Priority ERP. The dashboard is composed of **report widgets** arranged on **configurable pages**. Each report is a self-contained widget that can be moved between pages by editing a single config file.

- **Data source:** Priority ERP oData REST API (mock data in this spec)
- **Deployment:** GitHub → Railway auto-deploy
- **Embedding:** Airtable Omni custom element
- **Maintained by:** Claude Code (sole developer), reviewed by other LLMs (Grok, Deepseek, Gemini, Minimax)
- **Report registry:** Airtable "API Reports" table (source of truth for report definitions)
- **Page layout:** TypeScript config file (source of truth for which widgets appear where)

### 1.2 Scope of This Spec

1. Monorepo scaffolding (`server/`, `client/`, `shared/`, `specs/`)
2. Backend skeleton — Express + TypeScript, health endpoint, cache abstraction, mock data API
3. Frontend skeleton — React + Vite + Tailwind v4 + TypeScript, router, layout shell
4. Widget/page configuration framework — Zod-validated TypeScript config
5. One demo widget type (table) with mock data
6. Two demo pages proving the framework works
7. CLAUDE.md — project onboarding for AI editors

### 1.3 Out of Scope (Future Specs)

- Real Priority ERP API calls (Spec 02)
- Advanced filter builder with AND/OR groups (Spec 03+)
- Password-protected pages (Spec 03+)
- Framer Motion animations, skeleton shimmer, count-up numbers (Spec 03+)
- Charts — Recharts integration (Spec 03+)
- KPI card widgets (Spec 02+)
- Excel download widgets (Spec 03+)
- CSV export (Spec 03+)
- Date range picker (Spec 02+)

---

## 2. Architecture Decisions

### 2.1 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | TypeScript (strict, no `any`) | Type safety = permanent docs for AI editors |
| Backend | Node.js + Express | Simple, proven, LLM-friendly patterns |
| Frontend | React 19 + Vite | Fast builds, latest React |
| Styling | Tailwind CSS v4 | CSS-native config, utility-first, LLM-readable |
| Data Fetching | TanStack Query v5 | Server state mgmt, caching, refetch — no custom hooks |
| Validation | Zod | Runtime validation of configs + API params |
| Cache | Upstash Redis (behind abstraction) | HTTP-based, survives Railway restarts, free tier |
| Testing | Vitest | Fast, TypeScript-native |
| Deploy | GitHub → Railway | Push to deploy, zero config |

### 2.2 Design Approach (Spec 01)

**Reference: Apple + Stripe.** Clean, precise, premium. No animation framework yet.

**Typography:**
- Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif`
  - WHY: This IS the Apple/Stripe font. On Mac it renders as SF Pro — the actual Apple typeface. Zero load time, no Google Fonts import. This is a deliberate Apple design reference, not a lazy default.
- Page titles: 28px, weight 700, `tracking-tight` (-0.02em) — tight letter-spacing like Apple
- Card titles: 14px, weight 600, `text-slate-600`
- Table text: 13px, weight 400, `text-slate-700`
- Numbers: `tabular-nums` for column alignment in tables and KPIs

**Colors:**
- Page bg: `bg-slate-50` (#F8FAFC) — NOT pure white (Apple/Stripe both use off-white)
- Card bg: `bg-white`
- Card border: `border-slate-200/60` — very subtle, almost invisible
- Text primary: `text-slate-900` — headings, KPI values
- Text secondary: `text-slate-500` — labels, descriptions
- Text muted: `text-slate-400` — timestamps, tertiary
- Primary accent: `#007AFF` (Apple system blue) — active states, links, primary buttons
- Success: `emerald-500` — positive trends, shipped status
- Danger: `red-500` — negative values, errors
- Status badges: soft tinted backgrounds (e.g., `emerald-50` + `emerald-700`, never saturated solids)

**Cards:**
- `bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
  - WHY: Apple uses very subtle shadows — barely perceptible. The custom shadow is lighter than Tailwind's `shadow-sm`.
- Hover: `shadow-[0_4px_12px_rgba(0,0,0,0.06)]` with `transition-shadow duration-200`
- Border radius: `rounded-2xl` (16px) — Apple uses larger radius than most dashboards

**Tables (Stripe-style):**
- No cell borders — only `border-b border-slate-100` between rows
- Header: `text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50/80`
- Alternating rows: even rows `bg-slate-50/30` (very subtle)
- Hover: `hover:bg-blue-50/40 transition-colors duration-150`
- Currency: right-aligned, `tabular-nums`
- Negative currency: `text-red-500` with parentheses `($1,234.00)`

### 2.3 LLM-Optimized Code Requirements

**These rules apply to ALL code written for this project:**

1. **Intent block** at the top of every file:
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: path/to/file.ts
// PURPOSE: One sentence describing what this file does
// USED BY: What imports this file
// EXPORTS: Public API (functions, components, types)
// ═══════════════════════════════════════════════════════════════
```

2. **WHY comments** on every non-obvious decision. Never comment WHAT (LLMs can read code).
3. **Every file under 150 lines.** Split if approaching 200.
4. **Identical patterns** for identical things — all pages, all routes, all widgets follow the same structure.
5. **Descriptive, greppable names:** `fetchSalesOrders()` not `fetchData('sales')`.
6. **Import order** in every file: React/libraries → hooks → components → utils → types.
7. **No clever abstractions.** Explicit > implicit. Boring > clever. Readable > compact.

---

## 3. Project Structure

```
priority-dashboard/
├── server/
│   ├── src/
│   │   ├── index.ts                    # Express entry point
│   │   ├── config/
│   │   │   └── environment.ts          # Env config (Priority URLs, Redis, etc.)
│   │   ├── services/
│   │   │   ├── cache.ts                # Cache abstraction + Upstash implementation
│   │   │   ├── mockData.ts             # Mock data for demo widgets
│   │   │   └── logger.ts               # Structured JSON logger
│   │   └── routes/
│   │       ├── health.ts               # GET /api/v1/health
│   │       └── reports.ts              # GET /api/v1/reports/:reportId
│   ├── package.json
│   └── tsconfig.json
│
├── client/
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── App.tsx                     # Router + QueryProvider
│   │   ├── index.css                   # Tailwind v4 imports + design tokens
│   │   ├── config/
│   │   │   ├── pages.ts               # Page → widget layout (Zod-validated)
│   │   │   └── widgetRegistry.ts       # Widget type → React component mapping
│   │   ├── components/
│   │   │   ├── Layout.tsx              # Shell: top bar, nav tabs, content area
│   │   │   ├── PageRenderer.tsx        # Reads page config, renders widget grid
│   │   │   ├── WidgetRenderer.tsx      # Resolves widget type, renders component
│   │   │   ├── WidgetShell.tsx         # Common card wrapper (title, loading, error)
│   │   │   └── widgets/
│   │   │       └── DemoTableWidget.tsx # Demo table widget with mock data
│   │   ├── hooks/
│   │   │   └── useReportQuery.ts       # TanStack Query wrapper for report data
│   │   └── utils/
│   │       └── formatters.ts           # Currency, date, number formatting
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── shared/
│   └── types/
│       ├── api.ts                      # API response envelope types
│       ├── widget.ts                   # Widget + Page config types
│       └── index.ts                    # Re-exports all shared types
│
├── specs/
│   └── spec-01-foundation.md           # This file
│
├── CLAUDE.md                           # AI onboarding document
├── .env.example
├── .gitignore
└── railway.json
```

---

## 4. Shared Types

> Both backend and frontend import these via `@shared/types`.
> Configure TypeScript path aliases in both `server/tsconfig.json` and `client/vite.config.ts`.

### `shared/types/api.ts`

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/api.ts
// PURPOSE: Standardized API response envelope used by ALL endpoints.
//          Every API response has the same shape. No exceptions.
// USED BY: server routes (to build responses), client hooks (to parse responses)
// ═══════════════════════════════════════════════════════════════

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'currency' | 'number' | 'date' | 'percent';
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ResponseMeta {
  reportId: string;
  reportName: string;
  generatedAt: string;
  cache: 'hit' | 'miss';
  executionTimeMs: number;
  source: 'priority-odata' | 'mock';
}

// WHY: Every endpoint returns this exact shape so the frontend needs
// only ONE response handler. Adding a new report never requires
// new frontend parsing logic.
export interface ApiResponse<T = Record<string, unknown>> {
  meta: ResponseMeta;
  data: T[];
  pagination: PaginationMeta;
  columns: ColumnDefinition[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  environment: string;
  timestamp: string;
  cacheStatus: 'connected' | 'disconnected';
  version: string;
}
```

### `shared/types/widget.ts`

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/widget.ts
// PURPOSE: Types for the widget/page configuration system.
//          Pages are composed of widgets. This file defines both.
// USED BY: client/config/pages.ts, PageRenderer, WidgetRenderer
// ═══════════════════════════════════════════════════════════════

export interface WidgetConfig {
  id: string;           // Unique widget instance ID (e.g., 'overview-sales-table')
  reportId: string;     // Matches a report in the backend mock data or Airtable API Reports
  type: 'table';        // Widget type — only 'table' for Spec 01
  // Future types: 'kpi' | 'chart' | 'download'
  title: string;        // Display title shown in the widget card header
  colSpan: number;      // Grid column span (1-12, where 12 = full width)
}

export interface PageConfig {
  id: string;           // URL-safe page identifier (e.g., 'overview')
  name: string;         // Display name shown in navigation tabs
  path: string;         // URL path (e.g., '/overview')
  icon?: string;        // Lucide icon name (optional, for nav tabs)
  widgets: WidgetConfig[];
}
```

### `shared/types/index.ts`

```typescript
export * from './api';
export * from './widget';
```

---

## 5. Backend (Server Session)

### 5.1 Project Setup

```bash
cd priority-dashboard/server
npm init -y
npm install express cors dotenv zod @upstash/redis axios
npm install -D typescript @types/express @types/cors @types/node tsx vitest
```

**`server/tsconfig.json`** — strict mode, path alias for shared types:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

**`server/package.json` scripts:**
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

### 5.2 Environment Configuration

**`server/src/config/environment.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/environment.ts
// PURPOSE: Centralized environment configuration. Read .env once,
//          export typed config object. All other files import from here.
// USED BY: index.ts, cache.ts, routes, priorityClient (future)
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Priority ERP (not used in Spec 01 — mock data only)
  PRIORITY_ENV: z.enum(['uat', 'production']).default('uat'),
  PRIORITY_UAT_BASE_URL: z.string().url().optional(),
  PRIORITY_UAT_USERNAME: z.string().optional(),
  PRIORITY_UAT_PASSWORD: z.string().optional(),
  PRIORITY_PROD_BASE_URL: z.string().url().optional(),
  PRIORITY_PROD_USERNAME: z.string().optional(),
  PRIORITY_PROD_PASSWORD: z.string().optional(),

  // Upstash Redis
  UPSTASH_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
});

// WHY: Crash on startup if env vars are wrong. This prevents
// Claude Code from ever deploying with missing credentials.
export const env = EnvSchema.parse(process.env);
```

### 5.3 Cache Abstraction Layer

**`server/src/services/cache.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/cache.ts
// PURPOSE: Cache abstraction with Upstash Redis implementation.
//          The interface is the contract — swap implementations
//          without touching any business code.
// USED BY: routes/reports.ts
// EXPORTS: CacheProvider interface, createCache()
// ═══════════════════════════════════════════════════════════════

// WHY: Abstraction layer so we can swap from Upstash to Railway Redis
// or any other provider by implementing one file. Business code
// only knows about CacheProvider, never about Upstash directly.
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  isConnected(): Promise<boolean>;
}

// WHY: Cache keys must include ALL query params, not just reportId.
// Otherwise different pages of the same report return wrong cached data.
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 25}:${params.from ?? ''}:${params.to ?? ''}`;
}
```

Include both an Upstash implementation (used when env vars are set) and an in-memory fallback (used in development/testing when Redis is not configured). The fallback logs a warning on startup.

### 5.4 Mock Data Service

**`server/src/services/mockData.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/mockData.ts
// PURPOSE: Provides mock report data for Spec 01 demo widgets.
//          Will be replaced by real Priority API calls in Spec 02.
// USED BY: routes/reports.ts
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';

interface MockReport {
  name: string;
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
}

export const MOCK_REPORTS: Record<string, MockReport> = {
  'demo-sales-orders': {
    name: 'Recent Sales Orders',
    columns: [
      { key: 'ORDNAME', label: 'Order #', type: 'string' },
      { key: 'CUSTNAME', label: 'Customer', type: 'string' },
      { key: 'QPRICE', label: 'Amount', type: 'currency' },
      { key: 'CURDATE', label: 'Date', type: 'date' },
      { key: 'ORDSTATUSDES', label: 'Status', type: 'string' },
    ],
    data: [
      { ORDNAME: 'SO-24001', CUSTNAME: 'Whole Foods Market', QPRICE: 15420.50, CURDATE: '2026-03-15', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24002', CUSTNAME: 'Trader Joes', QPRICE: 8930.00, CURDATE: '2026-03-16', ORDSTATUSDES: 'Processing' },
      { ORDNAME: 'SO-24003', CUSTNAME: 'Costco Wholesale', QPRICE: 42100.00, CURDATE: '2026-03-17', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24004', CUSTNAME: 'Sprouts Farmers', QPRICE: 6750.25, CURDATE: '2026-03-18', ORDSTATUSDES: 'Pending' },
      { ORDNAME: 'SO-24005', CUSTNAME: 'HEB Grocery', QPRICE: 19800.00, CURDATE: '2026-03-18', ORDSTATUSDES: 'Processing' },
      { ORDNAME: 'SO-24006', CUSTNAME: 'Whole Foods Market', QPRICE: 11200.00, CURDATE: '2026-03-19', ORDSTATUSDES: 'Pending' },
      { ORDNAME: 'SO-24007', CUSTNAME: 'Kroger', QPRICE: 28350.75, CURDATE: '2026-03-19', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24008', CUSTNAME: 'Publix', QPRICE: 5600.00, CURDATE: '2026-03-20', ORDSTATUSDES: 'Processing' },
    ],
  },
  'demo-inventory': {
    name: 'Inventory Levels',
    columns: [
      { key: 'PARTNAME', label: 'SKU', type: 'string' },
      { key: 'PARTDES', label: 'Description', type: 'string' },
      { key: 'TBALANCE', label: 'On Hand', type: 'number' },
      { key: 'MINBAL', label: 'Reorder Point', type: 'number' },
      { key: 'VALUE', label: 'Value', type: 'currency' },
    ],
    data: [
      { PARTNAME: 'OOL-500', PARTDES: 'Organic Olive Oil 500ml', TBALANCE: 450, MINBAL: 100, VALUE: 6750.00 },
      { PARTNAME: 'BLS-250', PARTDES: 'Balsamic Vinegar 250ml', TBALANCE: 82, MINBAL: 150, VALUE: 2460.00 },
      { PARTNAME: 'HNY-340', PARTDES: 'Raw Honey 340g', TBALANCE: 320, MINBAL: 80, VALUE: 4800.00 },
      { PARTNAME: 'PST-500', PARTDES: 'Artisan Pasta 500g', TBALANCE: 15, MINBAL: 200, VALUE: 112.50 },
      { PARTNAME: 'SAL-200', PARTDES: 'Fleur de Sel 200g', TBALANCE: 600, MINBAL: 100, VALUE: 5400.00 },
      { PARTNAME: 'TOM-680', PARTDES: 'San Marzano Tomatoes 680g', TBALANCE: 45, MINBAL: 300, VALUE: 247.50 },
    ],
  },
};
```

### 5.5 API Routes

**`server/src/routes/health.ts`:**
```typescript
// GET /api/v1/health
// Returns: { status, environment, timestamp, cacheStatus, version }
```

**`server/src/routes/reports.ts`:**
```typescript
// GET /api/v1/reports/list     → returns array of available report IDs + names
// GET /api/v1/reports/:reportId → returns ApiResponse with mock data
// POST /api/v1/reports/:reportId/refresh → invalidates cache, re-fetches

// Every handler follows this exact pattern:
// 1. Parse + validate query params with Zod (page, pageSize)
// 2. Build cache key
// 3. Check cache → if hit, return cached response
// 4. If miss, get mock data (Spec 01) or call Priority API (Spec 02+)
// 5. Cache the result (fire-and-forget, never block on cache write failure)
// 6. Return standardized ApiResponse envelope
```

Query parameter validation with Zod:
```typescript
const QueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(1000).default(25),
  from: z.string().optional(),
  to: z.string().optional(),
});
```

### 5.6 Structured Logging

**`server/src/services/logger.ts`:**
```typescript
// WHY: Structured JSON logs so Railway captures them as searchable fields.
// Future AI tools can analyze these logs to find slow queries and errors.
export function logApiCall(entry: {
  level: 'info' | 'warn' | 'error';
  event: string;
  reportId: string;
  durationMs: number;
  cacheHit: boolean;
  rowCount?: number;
  statusCode: number;
}): void {
  console.log(JSON.stringify({ ...entry, timestamp: new Date().toISOString() }));
}
```

### 5.7 Express Server Entry Point

**`server/src/index.ts`:**
```typescript
// - Express with CORS, JSON parsing
// - Mount routes at /api/v1/
// - In production: serve client/dist as static files
// - In production: catch-all route returns index.html (SPA routing)
// - Log startup info: port, environment, cache status
```

In production, the server serves the built React app:
```typescript
import path from 'path';
import express from 'express';

if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  // WHY: SPA catch-all — React Router handles client-side routing.
  // Without this, direct URL access to /overview returns 404.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}
```

---

## 6. Frontend (Client Session)

### 6.1 Project Setup

```bash
cd priority-dashboard/client
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query react-router-dom lucide-react
npm install -D tailwindcss @tailwindcss/vite @types/node
```

**`client/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // WHY: Proxy API calls to Express in development.
      // In production, Express serves both API and static files.
      '/api': 'http://localhost:3001',
    },
  },
});
```

### 6.2 Design Tokens + Global Styles

**`client/src/index.css`** — Tailwind v4 CSS-native config:
```css
@import "tailwindcss";

@theme {
  /* WHY: System font stack renders as SF Pro on Mac — the actual Apple typeface.
     This is a deliberate Apple/Stripe design reference, not a lazy default.
     Zero load time, no external font dependency. */
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;

  /* WHY: Apple system blue (#007AFF) as primary accent instead of generic blue-500.
     This is the exact blue used across Apple's UI. */
  --color-primary: #007AFF;
}

/* WHY: Custom scrollbar matches the Stripe aesthetic.
   Thin, rounded, subtle — not the default chunky browser scrollbar. */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* WHY: tabular-nums ensures numbers in tables/KPIs align in columns.
   Without this, $1,234 and $999 would have different widths. */
.tabular-nums { font-variant-numeric: tabular-nums; }
```

### 6.3 Layout Shell

**`client/src/components/Layout.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Layout.tsx
// PURPOSE: Application shell — top bar with nav tabs + content area.
//          Reads page config to auto-generate navigation tabs.
// USED BY: App.tsx (wraps all routes)
// ═══════════════════════════════════════════════════════════════

// Structure:
// ┌──────────────────────────────────────────────────────┐
// │  Dashboard Title          [env badge]    [refresh]   │
// │  [Tab 1] [Tab 2] [Tab 3]                            │
// ├──────────────────────────────────────────────────────┤
// │                                                      │
// │  Page content (rendered by PageRenderer)             │
// │                                                      │
// └──────────────────────────────────────────────────────┘

// - Top bar: bg-white, border-b border-slate-200/60
// - Page content area: bg-slate-50, p-6
// - Nav tabs: text-sm font-medium, active tab has border-b-2 border-blue-500
// - Tabs are auto-generated from pages config (config/pages.ts)
// - Active tab determined by current URL path (useLocation)
```

### 6.4 Page + Widget Configuration (Zod-validated)

**`client/src/config/pages.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.ts
// PURPOSE: Defines which widgets appear on which pages and in what layout.
//          This is the ONLY file you edit to rearrange the dashboard.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: Layout.tsx (for nav tabs), PageRenderer (for widget grid)
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const WidgetConfigSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  type: z.enum(['table']),  // Expand as we add widget types
  title: z.string(),
  colSpan: z.number().min(1).max(12).default(12),
});

const PageConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  widgets: z.array(WidgetConfigSchema),
});

// WHY: Validate at import time. If someone adds a widget with a typo
// in the type field, the app fails immediately with a clear Zod error
// instead of silently rendering nothing.
export const pages = z.array(PageConfigSchema).parse([
  {
    id: 'overview',
    name: 'Overview',
    path: '/overview',
    widgets: [
      { id: 'overview-sales', reportId: 'demo-sales-orders', type: 'table', title: 'Recent Sales Orders', colSpan: 12 },
      { id: 'overview-inventory', reportId: 'demo-inventory', type: 'table', title: 'Inventory Levels', colSpan: 12 },
    ],
  },
  {
    id: 'sales',
    name: 'Sales',
    path: '/sales',
    widgets: [
      { id: 'sales-orders', reportId: 'demo-sales-orders', type: 'table', title: 'All Sales Orders', colSpan: 12 },
    ],
  },
]);
```

### 6.5 Widget Registry + Renderers

**`client/src/config/widgetRegistry.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/widgetRegistry.ts
// PURPOSE: Maps widget type names to React components.
//          Adding a new widget type = import component + add one line here.
// USED BY: WidgetRenderer.tsx
// ═══════════════════════════════════════════════════════════════

import type { ComponentType } from 'react';
import DemoTableWidget from '../components/widgets/DemoTableWidget';

export interface WidgetProps {
  reportId: string;
}

export const widgetRegistry: Record<string, ComponentType<WidgetProps>> = {
  table: DemoTableWidget,
  // Future: kpi: KPIWidget, chart: ChartWidget, download: DownloadWidget
};
```

**`client/src/components/PageRenderer.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/PageRenderer.tsx
// PURPOSE: Renders a page by reading its widget config and laying
//          them out in a responsive 12-column grid.
// USED BY: App.tsx (one PageRenderer per route)
// ═══════════════════════════════════════════════════════════════

// WHY: Tailwind purges dynamic class names like `col-span-${n}`.
// This explicit mapping ensures all col-span classes are preserved.
const COL_SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
  7: 'col-span-7', 8: 'col-span-8', 9: 'col-span-9',
  10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
};

// Renders: <div className="grid grid-cols-12 gap-6">
//            <div className="col-span-{n}"><WidgetRenderer .../></div>
//            ...
//          </div>
// On mobile (< lg), all widgets stack full-width.
```

**`client/src/components/WidgetRenderer.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/WidgetRenderer.tsx
// PURPOSE: Resolves a widget config to its React component via the registry.
//          Wraps it in WidgetShell for consistent card styling.
// USED BY: PageRenderer.tsx
// ═══════════════════════════════════════════════════════════════

// Logic:
// 1. Look up widget.type in widgetRegistry
// 2. If not found, render an error card ("Unknown widget type: ...")
// 3. If found, render: <WidgetShell title={widget.title}>
//                         <Component reportId={widget.reportId} />
//                       </WidgetShell>
```

**`client/src/components/WidgetShell.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/WidgetShell.tsx
// PURPOSE: Common card wrapper for all widgets. Provides consistent
//          styling: white card, rounded corners, shadow, title bar.
// USED BY: WidgetRenderer.tsx
// ═══════════════════════════════════════════════════════════════

// Visual structure:
// ┌─────────────────────────────────────────┐
// │  Widget Title                    [...]  │  ← header: p-4, border-b
// │                                         │
// │  {children}                             │  ← content: p-4
// │                                         │
// └─────────────────────────────────────────┘
//
// Card: bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
//       hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200
```

### 6.6 Demo Table Widget

**`client/src/components/widgets/DemoTableWidget.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/DemoTableWidget.tsx
// PURPOSE: Renders report data as a styled table.
//          Uses useReportQuery to fetch data from the backend.
//          Formats cells based on column type (currency, date, etc.)
// USED BY: widgetRegistry.ts (registered as 'table' type)
// PROPS: reportId (string) — which report to fetch
// ═══════════════════════════════════════════════════════════════

// Data flow:
// 1. Calls useReportQuery(reportId) → TanStack Query fetches /api/v1/reports/:reportId
// 2. Receives ApiResponse with data[] + columns[]
// 3. Renders a <table> with columns as headers and data as rows
// 4. Formats each cell based on column.type using formatters.ts

// Table styling (Stripe-style):
// - No cell borders — only border-b border-slate-100 between rows
// - Header: text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50
// - Rows: even rows bg-slate-50/30 (very subtle, per Section 2.2)
// - Hover: hover:bg-blue-50/40 transition-colors duration-150
// - Currency: right-aligned, tabular-nums
// - Negative currency: text-red-500 with parentheses

// Loading state: simple "Loading..." text (skeleton shimmer in future spec)
// Error state: red card with retry button
// Empty state: centered message "No data available"
```

### 6.7 Data Fetching Hook

**`client/src/hooks/useReportQuery.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Thin wrapper around TanStack Query for fetching report data.
//          ALL widgets use this hook. No direct API calls in components.
// USED BY: DemoTableWidget, future widget components
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@shared/types';

interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

export function useReportQuery(reportId: string, params: ReportQueryParams = {}) {
  return useQuery<ApiResponse>({
    // WHY: queryKey includes all params so TanStack Query caches
    // each page/filter combination separately.
    queryKey: ['report', reportId, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', String(params.page));
      if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
      if (params.from) searchParams.set('from', params.from);
      if (params.to) searchParams.set('to', params.to);

      const url = `/api/v1/reports/${reportId}?${searchParams}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Report fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes before refetch
  });
}
```

### 6.8 Utility Functions

**`client/src/utils/formatters.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/formatters.ts
// PURPOSE: Formatting functions for currency, dates, numbers, percents.
//          Used by all widgets to ensure consistent display.
// USED BY: DemoTableWidget, future widget components
// ═══════════════════════════════════════════════════════════════

// formatCurrency(15420.50) → "$15,420.50"
// formatCurrency(-1234)    → "($1,234.00)"  (negative in parens)
// formatNumber(1234567)    → "1,234,567"
// formatDate('2026-03-15') → "Mar 15, 2026"
// formatPercent(0.153)     → "+15.3%"
// formatCellValue(value, columnType) → dispatches to the right formatter
```

### 6.9 App Entry Point

**`client/src/App.tsx`:**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/App.tsx
// PURPOSE: Root component. Sets up QueryClient, Router, and routes.
//          Routes are auto-generated from pages config.
// USED BY: main.tsx
// ═══════════════════════════════════════════════════════════════

// Structure:
// <QueryClientProvider>
//   <BrowserRouter>
//     <Layout>
//       <Routes>
//         <Route path="/" element={<Navigate to="/overview" />} />
//         {pages.map(page => (
//           <Route path={page.path} element={<PageRenderer page={page} />} />
//         ))}
//       </Routes>
//     </Layout>
//   </BrowserRouter>
// </QueryClientProvider>

// WHY: Routes are generated from pages config so adding a new page
// NEVER requires touching App.tsx — just add to config/pages.ts.
```

---

## 7. CLAUDE.md

Create this at the project root. This is the first file Claude Code reads when opening the project.

```markdown
# Priority ERP Dashboard

## What is this project?
A web dashboard that visualizes Priority ERP data, embedded in Airtable via Omni.
Reports are widgets arranged on configurable pages.

**Data flow:** Priority oData API → Express backend → Redis cache → React frontend
**Language:** TypeScript strict mode throughout. Zero plain JavaScript.
**Maintained by:** Claude Code (sole developer). Reviewed by Grok, Deepseek, Gemini, Minimax.

## Tech Stack
- **Backend:** Express, Zod, @upstash/redis, TypeScript
- **Frontend:** React 19, Vite, Tailwind CSS v4, TanStack Query v5
- **Shared types:** `shared/types/` — imported by both server and client
- **Deploy:** GitHub → Railway auto-deploy
- **Cache:** Upstash Redis via CacheProvider abstraction

## Commands
| Command | Where | Description |
|---------|-------|-------------|
| `npm run dev` | `server/` | Start Express on port 3001 |
| `npm run dev` | `client/` | Start Vite on port 5173 |
| `npm test` | `server/` | Run Vitest |

## Code Rules (MANDATORY)
1. Intent block at top of every file (FILE, PURPOSE, USED BY, EXPORTS)
2. WHY comments on non-obvious decisions. Never comment WHAT.
3. Every file under 150 lines. Split if approaching 200.
4. Import order: React/libraries → hooks → components → utils → types
5. All pages follow the widget config pattern (edit config/pages.ts)
6. All data fetching via TanStack Query (useReportQuery hook)
7. All API responses use the ApiResponse envelope (shared/types/api.ts)
8. Descriptive greppable names: `formatCurrencyValue()` not `fmt()`

## How to Add a New Widget to a Page
1. Open `client/src/config/pages.ts`
2. Add a widget entry to the page's `widgets` array
3. Done. The page auto-renders it.

## How to Add a New Page
1. Open `client/src/config/pages.ts`
2. Add a new page entry with `id`, `name`, `path`, `widgets`
3. Done. Nav tab appears automatically. Route is auto-registered.

## How to Add a New Widget Type
1. Create component in `client/src/components/widgets/`
2. Register it in `client/src/config/widgetRegistry.ts`
3. Use the new type name in `pages.ts` widget entries

## How to Add a New Report (Spec 02+)
1. Add report definition to Airtable "API Reports" table
2. Add backend route or use generic /api/v1/reports/:reportId
3. Add widget entry to the page config

## Architecture
- `config/pages.ts` = WHERE reports appear (page layout)
- Airtable "API Reports" table = WHAT reports exist (data source)
- `config/widgetRegistry.ts` = HOW reports render (component mapping)
- `shared/types/api.ts` = API response contract (never change shape without review)
- `services/cache.ts` = CacheProvider interface (swap implementations freely)

## Airtable Field IDs (API Reports Table)
Always use field IDs as primary identifiers. Field names may change.
| Field ID | Current Name | Access |
|----------|-------------|--------|
| fldrsiqwORzxJ6Ouq | Report ID | Read/Write |
| fld25jP32l42vFuOQ | Name | Read only |
| fldaCPDd17WYuxjQS | Category | Read only |
| fldGodmqZcWJ9xtvj | Priority Interface | Read only |
| fldTbiJ7t4Ldd3cH9 | Template | Read only |
| fldAAdwPBUQBRQet7 | Claude Status | Read/Write |
| fld1cKObhpMuz3VYq | Claude Comments | Read/Write |
| fld88uqAVUuDWUaBQ | Victor Status | Read only |
| fldfGYjvGFcxvGC1K | Victor Comments | Read only |

## Common Mistakes (avoid these)
- Using `useEffect` for data fetching instead of TanStack Query
- Hardcoding Tailwind colors instead of using the design token palette
- Dynamic Tailwind classes like `col-span-${n}` — use the COL_SPAN_CLASSES map
- Making files longer than 150 lines instead of splitting
- Forgetting the intent block at top of new files
- Using field names instead of field IDs for Airtable
```

---

## 8. Configuration Files

### `.env.example`
```env
# Server
NODE_ENV=development
PORT=3001

# Priority ERP (not used in Spec 01)
PRIORITY_ENV=uat
PRIORITY_UAT_BASE_URL=https://us.priority-connect.online/odata/Priority/tabXXXXX.ini/COMPANY/
PRIORITY_UAT_USERNAME=
PRIORITY_UAT_PASSWORD=
PRIORITY_PROD_BASE_URL=
PRIORITY_PROD_USERNAME=
PRIORITY_PROD_PASSWORD=

# Upstash Redis (free tier at upstash.com)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

### `railway.json`
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "cd server && npm run build && npm start",
    "healthcheckPath": "/api/v1/health"
  }
}
```

### `.gitignore`
```
node_modules/
dist/
.env
.DS_Store
*.log
```

---

## 9. Airtable Integration Reference

> Not implemented in Spec 01 — this is reference for future specs.

**Base:** Savory Gourmet (`appjwOgR4HsXeGIda`)
**Table:** API Reports (`tblvqv3S31KQhKRU6`)
**Claude's working view:** Claude To Do (`viwDHPgccLzje22um`)

### Workflow (Spec 02+)
1. Victor adds a report row in Airtable with Priority endpoints + instructions
2. Claude reads the "Claude To Do" view
3. Claude implements the report (backend route + frontend widget)
4. Claude updates "Claude Status" and "Claude Comments" fields
5. Claude logs changes in the Airtable record comments
6. Claude NEVER modifies "Victor Status" or "Victor Comments"

### Field ID Convention
**Always use Airtable field IDs as the primary identifier in code.** Field names can change; field IDs are permanent. Document the current field name as a comment.

```typescript
// WHY: Field IDs are permanent. Field names can be renamed in Airtable
// without breaking the integration. Comments show current names for readability.
const AIRTABLE_FIELDS = {
  REPORT_ID:      'fldrsiqwORzxJ6Ouq', // Report ID
  NAME:           'fld25jP32l42vFuOQ', // Name
  CATEGORY:       'fldaCPDd17WYuxjQS', // Category
  PRIORITY_IFACE: 'fldGodmqZcWJ9xtvj', // Priority Interface
  TEMPLATE:       'fldTbiJ7t4Ldd3cH9', // Template
  CLAUDE_STATUS:  'fldAAdwPBUQBRQet7', // Claude Status
  CLAUDE_COMMENT: 'fld1cKObhpMuz3VYq', // Claude Comments
  VICTOR_STATUS:  'fld88uqAVUuDWUaBQ', // Victor Status (READ ONLY)
  VICTOR_COMMENT: 'fldfGYjvGFcxvGC1K', // Victor Comments (READ ONLY)
} as const;
```

---

## 10. Acceptance Criteria

### Backend Session Done When:
- [ ] `server/` runs with `npm run dev` on port 3001
- [ ] `GET /api/v1/health` returns `{ status: 'ok', environment, timestamp, cacheStatus }`
- [ ] `GET /api/v1/reports/list` returns list of demo reports
- [ ] `GET /api/v1/reports/demo-sales-orders` returns standardized `ApiResponse` with mock data
- [ ] `GET /api/v1/reports/demo-inventory` returns standardized `ApiResponse` with mock data
- [ ] Cache abstraction exists with Upstash + in-memory fallback
- [ ] All files have intent blocks, all are under 150 lines
- [ ] `shared/types/` exists with `api.ts`, `widget.ts`, `index.ts`
- [ ] CLAUDE.md exists at project root

### Frontend Session Done When:
- [ ] `client/` runs with `npm run dev` on port 5173
- [ ] Navigating to `/` redirects to `/overview`
- [ ] Overview page renders 2 table widgets with mock data
- [ ] Sales page renders 1 table widget with mock data
- [ ] Navigation tabs switch between pages (auto-generated from `pages.ts`)
- [ ] Tables show formatted currency (USD) and dates
- [ ] Negative currency values show in red with parentheses
- [ ] Adding a widget to `pages.ts` makes it appear on the page (no other changes needed)
- [ ] Adding a page to `pages.ts` creates a new nav tab + route (no other changes needed)
- [ ] All files have intent blocks, all are under 150 lines
- [ ] Page bg is slate-50, cards are white with rounded-2xl and custom subtle shadow

---

## 11. Future Specs Roadmap

| Spec | Focus | Key Features |
|------|-------|-------------|
| 02 | Real Data | Priority API client, real endpoints, Airtable report registry integration |
| 03 | Filters + Polish | Advanced AND/OR filter builder, date range picker, Framer Motion animations |
| 04 | Widget Types | KPI cards, charts (Recharts), Excel download widgets |
| 05 | Access Control | Password-protected pages, env badge, user session |
| 06 | Production Polish | Error boundaries, skeleton loaders, responsive breakpoints, Lighthouse audit |
