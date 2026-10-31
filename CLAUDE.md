# Priority ERP Dashboard

## What is this project?

A web dashboard that visualizes Priority ERP data, embedded in Airtable via Omni.
Reports are **widgets** arranged on **configurable pages**. Adding a page or rearranging widgets requires editing one config file — no component code changes.

**Data flow:** Priority OData API → Express backend → Upstash Redis cache → React frontend. The BBD Extend feature also writes to Priority (`EXPDEXT_SUBFORM`) and snapshots each extended lot to an Airtable base, which the BBD "Extended" tab reads back.
**Language:** TypeScript strict mode throughout. Zero plain JavaScript.
**Maintained by:** Claude Code (sole developer).

## Production state (2026-10-31)

| Report id | Page | Key behavior |
|-----------|------|--------------|
| `grv-log` | `/food-safety/receiving-log` | Goods Receiving Vouchers from `DOCUMENTS_P`. Never cached (`disableCache`), Live/UAT toggle, vendor V8491 hard-excluded, week filter, template-mode Excel export |
| `grv-log-supabase` | `/food-safety/receiving-log-supabase` (hidden, no nav tab) | Same GRVs read from Supabase view `priority_reports.grv_receiving_log` (remarks parsed by the sync; V8491 excluded in the view); SQL-side filters (`sqlFilterBuilder.ts`), Temp Tracker Included/Accepted columns (Excel P/Q), Refresh re-reads the last 30 days via `priority_reports.request_grv_refresh()`. Live only |
| `customer-returns` | `/food-safety/customer-returns` | `DOCUMENTS_N` returns with `STATDES eq 'Final'`, exploded to one row per line item, attachments downloaded through `/api/v1/attachments` |
| `customer-returns-supabase` | `/food-safety/customer-returns-supabase` (hidden, no nav tab) | Same Final returns read from Supabase view `priority_reports.customer_returns_log` (one row per line; remarks parsed and masked in the DB; file list as jsonb, downloads still through `/api/v1/attachments`); SQL-side filters; Invoice # relabelled Credit Memo # (the view's ivnum is the credit memo); no Refresh button (~5 min sync lag). Live only |
| `bbd` | `/purchasing/bbd` | Best By Dates from `RAWSERIAL`; balance = sum of `RAWSERIALBAL_SUBFORM` bins; Extend (single, or bulk up to 1,000 lots in 50-lot chunks) writes to Priority + Airtable; "Extended" sub-tab lists extended lots from Airtable |

**Spec workflow:** numbered specs 01–13 are archived in `specs/done/` (read-only history). New work uses dated files: design spec in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, implementation plan in `docs/superpowers/plans/`. Mark the spec `**Status:** Implemented (date)` once deployed. Non-trivial plans get a Codex adversarial review (`/codex:adversarial-review`) before approval.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express 5 + TypeScript |
| Frontend | React 19 + Vite + Tailwind CSS v4 + Framer Motion |
| Data Fetching | TanStack Query v5 |
| Validation | Zod |
| Cache | Upstash Redis (via `CacheProvider` abstraction) |
| Excel | exceljs — template mode (Airtable attachment) or fallback mode (headers + data) |
| Airtable | REST API — export templates (API Reports table) and BBD extended-lot snapshots (Short-Dated Items base) |
| Tests | Vitest — server (`server/tests/`, also runs `shared/` tests) and client (jsdom) |
| Deploy | GitHub → Railway auto-deploy |

## Commands

| Command | Where | Description |
|---------|-------|-------------|
| `npm run dev` | `server/` | Start Express on port 3001 |
| `npm run dev` | `client/` | Start Vite on port 5173 (proxies `/api` to 3001) |
| `npm test` | `server/` | Vitest — server + shared tests |
| `npm test` | `client/` | Vitest (jsdom) — client tests |
| `npm run lint` | `client/` | ESLint |

**Development:** run both `npm run dev` commands in separate terminals (`.claude/launch.json`, local only, defines them as the `backend` and `frontend` preview servers). Local `.env` uses `PRIORITY_ENV=uat`; the GRV widget defaults to Live, which 502s locally because `.env` has no production credentials — click UAT.

**iCloud Drive gotcha:** this repo lives under `~/Documents/Documents - Victor’s MacBook Pro/…` (curly apostrophe in the path). iCloud evicts file contents, `node_modules` included, and evicted files fail on open. Symptoms: tsc "file not found" for `@types/*`, phantom vitest failures, or `tsc`/`vitest` sitting at 0 % CPU for minutes. `du -sh server/node_modules client/node_modules` reading a few MB means evicted (warm they are hundreds of MB). Warm before trusting any failure:
```bash
find server/node_modules client/node_modules -type f -print0 | xargs -0 -P 8 -n 200 cat > /dev/null
```
Git commands can take minutes for the same reason — run long ones in the background instead of assuming a hang.

**Deploy:** push to `main` on GitHub → Railway auto-deploys via `Dockerfile` (multi-stage build). Express serves the React client in production.

**Production URL:** `https://priority-reports-production.up.railway.app`

**Confirming a deploy landed:** `/api/v1/health` returns a static `version: '1.0.0'`, so a 200 proves nothing. Check the Railway deployment list (Railway MCP `list_deployments`, or the dashboard) for the pushed commit with status SUCCESS. When client code changed you can also compare the bundle hash: capture `curl -s <prod>/ | grep -o 'assets/index-[^"]*\.js'` before pushing and poll until it differs (~40 s typical; stop after 5 min). Server-only or docs-only pushes keep the same hash forever — use a read-only behavior probe whose response differs between old and new code.

**Airtable embed:** each department is embedded in Airtable via an Omni block whose iframe points at a department URL (`/food-safety/…`, `/purchasing/…`); `/` redirects to the first department. Test production changes at the Airtable page, not just the direct Railway URL — iframe constraints can surface different behavior.

**Local Docker test:** `docker build -t priority-dashboard . && docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 -e PRIORITY_ENV=production priority-dashboard` (PRIORITY_ENV is mandatory in production since the env-toggle boot guard, 2026-08-03)

**Pre-deploy checklist (run before pushing to `main`):**
```bash
cd client && npx tsc -b --noEmit   # Client TS build (catches unused vars, type errors)
cd ../server && npx tsc --noEmit   # Server TS build
```
Both must pass cleanly — any TypeScript error kills the Railway Docker build.

## Environments

- `SUPABASE_GRV_DATABASE_URL` (optional): session-pooler URL for role `priority_reports_server`, which can read only the GRV and customer-returns views and call the two GRV refresh functions. Unset → the `grv-log-supabase` and `customer-returns-supabase` routes answer 503 and everything else works. It is set only as a Railway variable (no local `.env` copy): for local live checks run the server with `railway run -p ba2225e5-2792-4708-aa66-d3b178cfb8d0 -e production -s priority-reports -- …`, which also injects production Priority credentials.
- `PRIORITY_ENV=uat|production` selects the `PRIORITY_UAT_*` or `PRIORITY_PROD_*` credentials from `.env` (`server/src/config/environment.ts`). With `NODE_ENV=production` the server refuses to boot unless `PRIORITY_ENV` is set explicitly.
- The GRV widget's Live/UAT toggle sends `environment: 'production' | 'uat'` on query, filters and export requests. The server honors it only for reports with `allowEnvOverride: true` (grv-log), through the request-scoped override in `server/src/config/priorityEnvContext.ts` that `getPriorityConfig()` consults. Every other report and every write route ignores it, so writes can never be pointed at UAT.
- Redis keys are environment-scoped (query, export, filters), so Live and UAT data never mix. Responses carry `meta.priorityEnv` as provenance — assert it in probes.

## Project Structure

```
├── server/
│   ├── src/config/      ← environment, Priority creds, env override context, reportRegistry
│   ├── src/reports/     ← one self-registering report definition per file
│   ├── src/routes/      ← query, queryRefresh, filters, export, extend (BBD), subform, attachments, health
│   ├── src/services/    ← Priority HTTP + rate limit, cache, Excel, Airtable, HTML parsers
│   └── tests/           ← ALL server tests (never colocate under src/)
├── client/
│   ├── src/config/      ← departments.ts, pages.ts, widgetRegistry.ts, detailRegistry.ts
│   ├── src/components/  ← widgets, table, filter/sort/column panels, modals, cells, details
│   └── src/hooks/       ← TanStack Query hooks + UI state hooks
├── shared/types/        ← Types used by BOTH client and server
├── shared/utils/        ← weekUtils.ts, timezone.ts (LA calendar-day helpers)
├── docs/
│   ├── superpowers/     ← specs/, plans/, evals/, prompts/ — dated; the current workflow
│   ├── airtable-field-ids.md       ← Short-Dated Items base (BBD Extended tab) field IDs
│   ├── filter-test-results.md      ← 2026-03-23 filter test session
│   └── priority-api-call-example.md
├── specs/done/          ← Numbered specs & plans 01–13 (archive)
├── scripts/             ← Smoke-test scripts (sg-eval.sh, eval-sort-panel.sh)
├── tools/priority_erp.xml ← Priority OData metadata (READ ONLY, gitignored)
├── Dockerfile           ← Multi-stage Docker build (Railway deployment)
├── railway.json         ← Railway config (builder=DOCKERFILE, healthcheck) — DO NOT DELETE
├── .dockerignore        ← Excludes node_modules, .env, .git, specs from Docker context
├── .claude/launch.json  ← backend/frontend preview servers (local only)
└── CLAUDE.md            ← You are here
```

## Behavioral Guidelines (MANDATORY)

These guidelines bias toward caution over speed. For trivial tasks, use judgment — but when in doubt, follow the rule.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## LLM-Optimized Code Rules (MANDATORY)

This code is maintained exclusively by LLMs. Every decision optimizes for AI readability.

1. **Intent block** at top of every file: `FILE`, `PURPOSE`, `USED BY`, `EXPORTS`
2. **WHY comments** on non-obvious decisions. Never comment WHAT (LLMs can read code).
3. **Import order:** React/libraries → hooks → components → utils → types
4. **Identical patterns** for identical things — all pages, all routes, all widgets.
5. **Descriptive greppable names:** `formatCurrencyValue()` not `fmt()`
6. **No clever abstractions.** Explicit > implicit. Boring > clever. Readable > compact.

## Architecture: Three Config Files Drive Everything

| File | Controls | Purpose |
|------|----------|---------|
| `client/src/config/departments.ts` + `pages.ts` | **WHERE** | Departments (URL prefix + nav) and which widgets appear on which pages, in what layout |
| `client/src/config/widgetRegistry.ts` | **HOW** | Which React component renders each widget type |
| `server/src/config/reportRegistry.ts` + `server/src/reports/*.ts` | **WHAT** | Which reports exist: entity, columns, OData query, row transform, and opt-ins (`clientSidePagination`, `expandConfig`, `rowStyleField`, `disableCache`, `allowEnvOverride`, `excelStyle`, `exportConfig`) |

The Airtable "API Reports" table is Victor's request tracker (status/comments) and holds the GRV Excel export template that `templateService.ts` reads by Report ID. It does not define which reports exist.

## How to Add a Widget to a Page

1. Open `client/src/config/pages.ts`
2. Add a widget entry to the page's `widgets` array
3. Done. The page auto-renders it.

## How to Add a New Page

1. Open `client/src/config/pages.ts`
2. Add a new page entry with `id`, `department`, `name`, `path`, `widgets` (departments live in `departments.ts`)
3. Done. Nav tab appears automatically. Route is auto-registered.

## How to Add a New Widget Type

1. Create component in `client/src/components/widgets/`
2. Register it in `client/src/config/widgetRegistry.ts`
3. Use the new type name in `pages.ts` widget entries

## How to Add a New Report

1. Create report definition in `server/src/reports/` (self-registers into `reportRegistry` on import)
2. Import it in `server/src/routes/reports.ts` for side-effect registration
3. Add a page/widget entry in `client/src/config/pages.ts` (mirror server opt-ins such as `clientSidePagination` on the widget)
4. Only if it needs a template-mode Excel export: add a record (Report ID + Template attachment) in the Airtable API Reports table
5. Add tests in `server/tests/`

**Finding entity names:** Check `tools/priority_erp.xml` for available Priority OData entity names and their field definitions.

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

**Short-Dated Items base** (BBD Extended tab snapshots): base `appEIH4f5K3vrKBuy`, table `tblR550VQRqNgNMNE`. Field IDs are in `docs/airtable-field-ids.md`; used by `server/src/services/airtableShortDated.ts` and `airtableSnapshots.ts`.

## Priority ERP API Reference

- **URL pattern:** `https://us.priority-connect.online/odata/Priority/tab{CODE}.ini/{COMPANY}/`
- **Auth:** HTTP Basic Auth (base64 encoded username:password)
- **Rate limits:** 100 calls/minute shared by every API user in the company, 15 queued max, 3-minute timeout per request. Writes count against a 10,000/month quota; reads do not.
- **Pagination:** `$top` + `$skip` params. Always paginate — large entities timeout without it.
- **MAXAPILINES:** Currently set to 50,000 (raised from default 2,000). Controls max rows per API response.
- **Optimal pattern:** Use `$expand=SUBFORM($select=field1,field2)` with nested `$select` to avoid N+1 subform calls. See `/priority-erp-api` skill for benchmarks.
- **Header:** Always include `Prefer: odata.maxpagesize=49900` (safety margin below MAXAPILINES=50,000)
- **Header:** Always include `IEEE754Compatible: true` (prevents floating-point precision issues)
- **XML metadata:** `tools/priority_erp.xml` contains all entity names and field definitions
- **Existing reference:** The sync project in the sibling folder `../Airtable_Priority_N8N_v1/` (own CLAUDE.md) uses the same Priority API — check its patterns when in doubt.

## Common Mistakes (avoid these)

- Using Tailwind v3 config patterns — v4 uses CSS-native `@theme` in `client/src/index.css`, NOT `tailwind.config.js`
- Importing Google Fonts — `--font-sans` is the system font stack (`-apple-system` → SF Pro on Mac). Deliberate.
- Hardcoding Tailwind colors, or the pre-April-2026 Apple-blue palette — use the SG Interface `@theme` tokens: `--color-bg-page`, `--color-gold-primary` / `-light` / `-muted` / `-subtle` / `-hover`, `--color-dark`, `--color-text-primary` / `-secondary` / `-muted` / `-faint`, `--radius-*`, `--shadow-*` (see the `design-sg-interface` skill)
- Using bare `rounded-2xl` or `shadow-sm` on cards — use `rounded-[var(--radius-3xl)]` and `shadow-[var(--shadow-card)]` (`@theme` remaps `rounded-2xl` itself to 14 px)
- Using `--color-text-faint` (#bbb) for anything that must be read, or `--color-text-muted` (#999) for data/body text — light greys wash out in the Airtable iframe's JPEG rendering. `--color-text-secondary` (#555) is the floor for content; muted is for labels and headers only.
- Assuming a blank-looking production page is a bug — light greys often appear invisible in screenshots. Check the DOM (`read_page`/accessibility tree) first; if the elements are there it is a contrast issue, not a rendering bug.
- Using `useEffect` for data fetching instead of TanStack Query
- Dynamic Tailwind classes like `` col-span-${n} `` — use the `COL_SPAN_CLASSES` map
- Forgetting the intent block at top of new files
- Colocating tests under `server/src/` — all server tests live in `server/tests/` (vitest picks up both locations, so a stray file still runs, but the convention is one directory)
- Using Airtable field names instead of field IDs
- Interpolating user input directly into OData `$filter` queries — validate with `z.string().regex(/^[a-zA-Z0-9_-]+$/)` (BBD lot numbers also allow `.` and space; single quotes are escaped at use)
- Building `$expand` with `URLSearchParams` — it percent-encodes `(` `)` and Priority rejects the query. Append `$expand=…` to the URL string raw.
- `PATCH` on `EXPDSERIAL` — fails with "insufficient form privileges". Extend an expiry by `POST`ing `{ RENEWDATE, EXPIRYDATE }` to `EXPDSERIAL(SERIALNAME='…')/EXPDEXT_SUBFORM` (see `server/src/routes/extend.ts`)
- Letting the request `environment` field reach a write route or a report without `allowEnvOverride` — the override is opt-in on purpose (see Environments)
- Changing the `ApiResponse` envelope shape without reviewing all consumers
- Using `app.get('*', ...)` for SPA catch-all — Express 5 requires `app.get('/{*path}', ...)` (path-to-regexp v8 needs named params)
- Confusing Express and React Router catch-all syntax — Express 5 uses `/{*path}`, React Router uses `path="*"`. They live in the same project but use different path syntaxes.
- Forgetting catch-all routes inside nested React Router groups — a parent route matching (e.g., `/food-safety`) doesn't 404 on unmatched children (e.g., `/food-safety/nonexistent`). Add `<Route path="*">` inside each nested group, not just at top level.
- Putting client-only types (e.g., `DepartmentConfig`) in `shared/types/` — only types used by BOTH client and server belong there. Client-only types go in the client config file that defines them.
- `$expand` on DOCUMENTS_P is BROKEN — Priority/CloudFront aborts the connection (confirmed March 2026 with page sizes 5 and 50, both encoded and raw URLs). Use the two-step `enrichRows` pattern: query parent with TYPE in `$select`, then `querySubform()` per row with composite key `(DOCNO='...',TYPE='...')`. Other entities (ORDERS, LOGPART, RAWSERIAL, EXPDSERIAL) work fine with `$expand`.
- Modifying Dockerfile paths without checking `__dirname` math — server at `/app/server/dist/server/src/` serves client from `../../../../client/dist` (4 levels up to `/app/`)
- Leaving unused variables/destructured bindings — `noUnusedLocals: true` in `tsconfig.app.json` means `tsc -b` fails, killing the Railway Docker build. Always clean up unused destructured props.
- Deleting `railway.json` — Railway needs this file to use the Dockerfile builder. Without it, deploy breaks.
- Removing the OID 1082 type parser in `server/src/services/supabaseDb.ts` — node-postgres turns a `date` into a local-midnight JS Date, shifting GRV dates by a day off UTC
- Connecting to Supabase with `sslmode=require` left in the URL, or disabling verification — node-postgres treats `require` as verify-full and Supabase's root CA isn't in Node's store; `buildPoolConfig` strips the URL's ssl params and pins `SUPABASE_ROOT_CA_2021` (expires 2031-04-26)
- Trusting a failing or silently stalled `tsc`/`vitest` run on this iCloud-backed repo before warming `node_modules` (see Commands)
