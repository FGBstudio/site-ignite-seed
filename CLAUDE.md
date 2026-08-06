# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on port 8080 (host "::")
npm run build        # Production build -> dist/ (base path /site-ignite-seed/)
npm run build:dev    # Build in development mode (base path /)
npm run lint         # ESLint over the repo
npm run test         # Vitest, single run
npm run test:watch   # Vitest watch mode
npx vitest run src/test/example.test.ts       # single test file
npx vitest run -t "name of the test"          # single test by name
npx playwright test                            # E2E (config from lovable-agent-playwright-config)
```

Both `bun.lock` and `package-lock.json` are committed; CI (`.github/workflows/deploy.yml`) uses `npm install`. Vitest only picks up `src/**/*.{test,spec}.{ts,tsx}`; setup lives in `src/test/setup.ts`.

## What this is

"FGB Engine Room" — an internal management platform for FGB Studio, a building-certification consultancy (LEED / WELL / CO2 / Energy). It covers the whole lifecycle: quotation → project execution (WBS, tasks, timesheets) → hardware procurement & shipping → sensor monitoring → invoicing. Originally scaffolded by Lovable; many inline comments are in Italian.

Stack: Vite + React 18 + TypeScript, shadcn/ui (Radix) + Tailwind, TanStack Query, Supabase (Postgres + Auth + Edge Functions), deployed as a static SPA to GitHub Pages.

## Architecture

### Routing and deployment constraints
`src/App.tsx` is the single route table. It uses **`HashRouter`**, not BrowserRouter, and `vite.config.ts` sets `base: '/site-ignite-seed/'` in production — both exist because the app is served from GitHub Pages. Never switch to BrowserRouter or hardcode absolute asset paths (`src/lib/assetUrl.ts` exists for base-aware asset URLs).

### Auth and roles
`src/contexts/AuthContext.tsx` is the only auth surface. Roles come from three sources merged by priority: the `user_roles` table, the `get_user_role` RPC, and normalization of legacy lowercase values (`admin` → `ADMIN`, `pm` → `PM`). `AppRole` is defined in `src/types/custom-tables.ts` and includes both legacy (`admin`, `editor`, `superuser`, `viewer`) and current (`ADMIN`, `PM`, `document_manager`, `specialist`, `energy_modeler`, `cxa`) values.

The provider deliberately sets `loading` to `false` exactly once and ignores `onAuthStateChange` events with an empty session ("ghost events" on tab switch); `QueryClient` also disables `refetchOnWindowFocus`. Both are intentional fixes for the page remounting when the user changes browser tab — don't "simplify" them away.

`ProtectedRoute` (`src/components/ProtectedRoute.tsx`) gates every route by `allowedRoles` and redirects to a role-specific landing page via `getDefaultRoute` (ADMIN/PM → `/`, operative roles → `/my-tasks`).

### Hub sections
`src/lib/hubSections.ts` defines the six top-level sections (Projects/Operations, Quotations, Office, HR, Monitor, Payments) with their route, brand color, CSS pictogram filter, and allowed roles. It is the source of truth for section navigation, the "coming soon" flag, and role-dependent labels (`getSectionDisplayName`: ADMIN sees "OPERATIONS", others "PROJECTS"). Adding a section means adding it here *and* to the route table.

### Domain model
`certifications` is the root business entity, not `projects` — `Project` in `src/types/custom-tables.ts` is explicitly deprecated. A certification hangs off a `site`, which belongs to a `brand`, which belongs to a `holding`. Around a certification sit `cert_wbs_phases` → `cert_tasks` → `cert_task_checklists`, `cert_payment_milestones`, `cert_collaborations`, `certification_stakeholders`, and `quotation_budget_history`.

Certification lifecycle status (`certifications.status` / `setup_status`) flows roughly: `potential` → `quotation` → `quotation_approved` → `da_configurare` → `in_corso` → `certificato`, with `canceled` as an exit. Quotation approval is server-side (`supabase/functions/approve-quotation-v2`), which is what promotes a quotation into a configurable project.

Monitoring data lives in three parallel tables — `site_energy_records`, `site_air_records`, `site_water_records` — with matching types in `src/types/site-{energy,air,water}.ts` and hooks `use{Monitor,Air,Water}Rows`.

### Data access layer
There is no repository/service layer: React Query hooks in `src/hooks/` call `supabase` directly and do the joins/aggregation in TypeScript. `src/services/forecasting.ts` is the exception.

`src/integrations/supabase/types.ts` is generated and **stale relative to the schema**, which is why the codebase is full of `.from("table" as any)` / `as never` casts. When a table is missing from the generated types, follow the existing pattern: cast the table name and declare the row shape in `src/types/custom-tables.ts` (or a domain type file) rather than regenerating types by hand.

Import the client from either `@/integrations/supabase/client` or `@/lib/supabase` (a re-export). `externalClient.ts` is a second client for the same project using the new publishable-key format. Both wrap `fetch` to send `apikey` and strip the bogus `Authorization: Bearer <publishable key>` header — keep that wrapper if you touch client construction.

### Monitor pivot pipeline
The Monitor Report is layered deliberately:
- `src/lib/monitorIdentity.ts` — resolves CLIENT | CITY | PROJECT for any row from `sites` + `brands` + `certifications`, never from denormalized columns on the record.
- `src/lib/monitorPivot.ts` — pure adapters + pivot tree builder (no React, no I/O). Business rules for period bucketing and typology splitting belong here.
- `src/pages/MonitorReport.tsx` — controller (filters, data fetching).
- `src/components/monitor/PivotTableRenderer.tsx` — rendering only.

Other pure-logic libs follow the same "no DB access" rule: `quotationBudget.ts` (FTE/budget builder, role day-rates), `energyFinance.ts`, `paymentSchemes.ts`, `productPricing.ts`. `productMap.ts` and `monitorIdentity.ts` are the two libs that *do* hit Supabase.

### Supabase edge functions
Deno functions in `supabase/functions/`. `supabase/config.toml` sets `verify_jwt = false` for the publicly-reachable ones (email webhooks, unsubscribe, escalation dispatch, `approve-quotation-v2`) — those must verify auth themselves (see the JWKS/`jose` verification in `approve-quotation-v2`). Functions without an entry keep gateway JWT verification and skip in-function auth checks.

The transactional email pipeline is `process-email-queue` → `send-transactional-email` (React Email templates registered in `supabase/functions/_shared/transactional-email-templates/registry.ts`, sent via Resend) with `handle-email-unsubscribe` / `handle-email-suppression` for bounce and opt-out handling, backed by `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`.

Migrations in `supabase/migrations/` are timestamped and Lovable-generated; there are ~84 of them and they are the real schema reference.

### UI conventions
`src/index.css` defines the "FGB Design System" as HSL CSS variables (teal `#009193` primary, ivory `#f5f4f0` background) consumed by `tailwind.config.ts`. Use semantic tokens (`bg-background`, `text-muted-foreground`, `bg-inbound`/`bg-outbound`) rather than raw colors.

Page chrome comes from `MainLayout` (`title` + optional `subtitle`, sticky header, `TopNavbar`). Headings use the Futura-like uppercase stack with letter-spacing; body text uses DM Sans. `src/components/ui/` is stock shadcn — prefer composing it over new primitives. Excel-style column filtering has shared components in `src/components/common/`.
