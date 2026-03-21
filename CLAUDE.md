# Priority ERP Dashboard

## What is this project?

A web dashboard that visualizes Priority ERP data, embedded in Airtable via Omni.
Reports are **widgets** arranged on **configurable pages**. Adding a page or rearranging widgets requires editing one config file — no component code changes.

**Data flow:** Priority oData API → Express backend → Redis cache → React frontend
**Language:** TypeScript strict mode throughout. Zero plain JavaScript.
**Maintained by:** Claude Code (sole developer). Reviewed by Grok, Deepseek, Gemini, Minimax.

## Current State

Building from specifications. Each spec has a matching implementation plan.
Backend and frontend are built in **separate Claude Code sessions** that share `shared/types/`.

**Parallel session rules:** Backend session only writes to `server/`. Frontend session only writes to `client/`. Shared types in `shared/types/` must be created before either session starts. Neither session should modify `CLAUDE.md`.

**Active:** `specs/02a-backend/` and `specs/02b-frontend/` (Spec 02 — real Priority API data)
**Completed:** `specs/done/` (Spec 01 — foundation with mock data)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express + TypeScript |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Data Fetching | TanStack Query v5 |
| Validation | Zod |
| Cache | Upstash Redis (via CacheProvider abstraction) |
| Deploy | GitHub → Railway auto-deploy |

## Commands

| Command | Where | Description |
|---------|-------|-------------|
| `npm run dev` | `server/` | Start Express on port 3001 |
| `npm run dev` | `client/` | Start Vite on port 5173 (proxies API to 3001) |
| `npm test` | `server/` | Run Vitest |

**Development:** Run both `npm run dev` commands in separate terminals. The Vite dev server proxies `/api` requests to Express.

**Deploy:** Push to `main` on GitHub → Railway auto-deploys via `Dockerfile` (multi-stage build). Express serves the React client in production.

**Local Docker test:** `docker build -t priority-dashboard . && docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 priority-dashboard`

## Project Structure

```
├── server/          ← Backend (Express + TypeScript)
├── client/          ← Frontend (React + Vite + Tailwind)
├── shared/types/    ← Shared TypeScript types (both import from here)
├── specs/           ← Build specs & plans, organized by workstream
│   ├── 02a-backend/ ← Backend spec + plan (current)
│   ├── 02b-frontend/← Frontend spec + plan (current)
│   └── done/        ← Completed specs (archived)
├── Dockerfile       ← Multi-stage Docker build (Railway deployment)
├── .dockerignore    ← Excludes node_modules, .env, .git from Docker context
├── tools/           ← Reference files (Priority XML metadata map — READ ONLY)
└── CLAUDE.md        ← You are here
```

## LLM-Optimized Code Rules (MANDATORY)

This code is maintained exclusively by LLMs. Every decision optimizes for AI readability.

1. **Intent block** at top of every file: `FILE`, `PURPOSE`, `USED BY`, `EXPORTS`
2. **WHY comments** on non-obvious decisions. Never comment WHAT (LLMs can read code).
3. **Every file under 150 lines.** Split if approaching 200.
4. **Import order:** React/libraries → hooks → components → utils → types
5. **Identical patterns** for identical things — all pages, all routes, all widgets.
6. **Descriptive greppable names:** `formatCurrencyValue()` not `fmt()`
7. **No clever abstractions.** Explicit > implicit. Boring > clever. Readable > compact.

## Architecture: Three Config Files Drive Everything

| File | Controls | Purpose |
|------|----------|---------|
| `client/src/config/pages.ts` | **WHERE** | Which widgets appear on which pages, in what layout |
| `client/src/config/widgetRegistry.ts` | **HOW** | Which React component renders each widget type |
| Airtable "API Reports" table | **WHAT** | What reports exist (Priority endpoints, instructions) |

## How to Add a Widget to a Page

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

1. Create report definition in `server/src/reports/` (self-registers via side-effect import)
2. Import it in `server/src/routes/reports.ts` for side-effect registration
3. Add widget entry to `client/src/config/pages.ts`
4. Update Airtable "API Reports" table with report metadata

**Finding entity names:** Check `tools/priority_erp.xml` for available Priority oData entity names and their field definitions.

## Airtable Field IDs (API Reports Table)

**Always use field IDs as the primary identifier.** Field names are kept as backup/comments for easy human review. Field names may change; field IDs are permanent.

| Field ID | Current Name | Access |
|----------|-------------|--------|
| `fldrsiqwORzxJ6Ouq` | Report ID | Read/Write |
| `fld25jP32l42vFuOQ` | Name | Read only |
| `fldaCPDd17WYuxjQS` | Category | Read only |
| `fldGodmqZcWJ9xtvj` | Priority Interface | Read only |
| `fldTbiJ7t4Ldd3cH9` | Template | Read only |
| `fldAAdwPBUQBRQet7` | Claude Status | Read/Write |
| `fld1cKObhpMuz3VYq` | Claude Comments | Read/Write |
| `fld88uqAVUuDWUaBQ` | Victor Status | **READ ONLY — NEVER MODIFY** |
| `fldfGYjvGFcxvGC1K` | Victor Comments | **READ ONLY — NEVER MODIFY** |

**Table:** `tblvqv3S31KQhKRU6` | **Base:** `appjwOgR4HsXeGIda` | **View:** `viwDHPgccLzje22um` (Claude To Do)

## Priority ERP API Reference

- **URL pattern:** `https://us.priority-connect.online/odata/Priority/tab{CODE}.ini/{COMPANY}/`
- **Auth:** HTTP Basic Auth (base64 encoded username:password)
- **Rate limits:** 100 calls/minute, 15 queued max, 3-minute timeout per request
- **Pagination:** `$top` + `$skip` params. Always paginate — large entities timeout without it.
- **Header:** Always include `Prefer: odata.maxpagesize=1000`
- **Header:** Always include `IEEE754Compatible: true` (prevents floating-point precision issues)
- **XML metadata:** `tools/priority_erp.xml` contains all entity names and field definitions
- **Existing reference:** The sync project at `/Users/victorproust/Documents/Work/Priority/Airtable_Priority_N8N_v1/` uses the same Priority API — check its patterns when in doubt.

## Common Mistakes (avoid these)

- Using Tailwind v3 config patterns — v4 uses CSS-native `@theme` in `index.css`, NOT `tailwind.config.js`
- Importing Google Fonts — we use the system font stack (`-apple-system` → SF Pro on Mac). This is a deliberate Apple/Stripe design reference.
- Using `blue-500` as primary — use `#007AFF` (Apple system blue) via `--color-primary` CSS variable
- Using `rounded-xl` on cards — use `rounded-2xl` (16px, Apple-style larger radius)
- Using `shadow-sm` on cards — use custom subtle shadow `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Using `useEffect` for data fetching instead of TanStack Query
- Hardcoding Tailwind colors instead of the design token palette
- Dynamic Tailwind classes like `` col-span-${n} `` — use the `COL_SPAN_CLASSES` map
- Making files longer than 150 lines instead of splitting
- Forgetting the intent block at top of new files
- Using Airtable field names instead of field IDs
- Interpolating user input directly into OData `$filter` queries — validate with `z.string().regex(/^[a-zA-Z0-9_-]+$/)`
- Changing the `ApiResponse` envelope shape without reviewing all consumers
- Using `app.get('*', ...)` for SPA catch-all — Express 5 requires `app.get('/{*path}', ...)` (path-to-regexp v8 needs named params)
- Using `$expand` on DOCUMENTS_P — Priority/CloudFront truncates the response. Use two-step fetch: query parent, then `querySubform()` per row
- Modifying Dockerfile paths without checking `__dirname` math — server at `/app/server/dist/server/src/` serves client from `../../../../client/dist` (4 levels up to `/app/`)
