

## Plan — Brand creation, Client/Supplier directory, Admin escalation notifications

Three independent capabilities grouped in one rollout.

---

### Part A — Inline "Create Brand" (and Holding) in site/project creation

**Where**: `ProjectCreateWizard.tsx` Step 1 + `SiteProjectOnboardingForm.tsx` site selector.

- Next to the **Brand** dropdown, add a `+` button (mirrors the existing "+ New Site" pattern).
- Clicking opens a small inline form (Apple-style): `Brand name *`, optional `Logo URL`. Same `+` for **Holding** (a brand needs a holding).
- On submit: insert into `holdings` / `brands`, invalidate `["holdings"]` / `["brands", holdingId]`, auto-select the new entry. Admin-only (gated by `isAdmin`).
- No DB migration — tables already exist with the right columns (`holdings`, `brands` both have `name`, `logo_url`).

---

### Part B — Contacts module (Client & Supplier directory)

**New top-nav entry** `Contacts` (admin + PM read-only) → `/contacts` page with two tabs: **Clients** and **Suppliers**.

**DB migration** — single new table `contacts`:
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| kind | text | `client` \| `supplier` |
| company_name | text NOT NULL | |
| vat_number | text | partita IVA / VAT |
| tax_code | text | codice fiscale / SDI |
| address, city, country, postal_code | text | |
| website, email, phone, pec | text | |
| iban, bank_name | text | only meaningful for suppliers, but kept generic |
| primary_contact_name, primary_contact_role, primary_contact_email, primary_contact_phone | text | |
| notes | text | free notes |
| brand_id | uuid → brands(id) NULLABLE | optional link client → brand |
| created_by, created_at, updated_at | | |

RLS: Admin full access (via `is_admin(auth.uid())`); PM read-only (`SELECT` for authenticated). Trigger `set_updated_at`.

**UI**:
- `Contacts.tsx` page — searchable list (filter by kind, search by company / VAT / city), `+ New contact` button (Admin only).
- `ContactFormDialog.tsx` — create/edit form, all fields above; Zod validation (email/website/phone format, max-length).
- Detail drawer with copy-to-clipboard on each field.
- Optional: in `SiteProjectOnboardingForm` and `ProjectCreateWizard`, the existing `client` text field gets an autocomplete pulling from `contacts WHERE kind='client'` (no breaking change — still a free-text fallback).

---

### Part C — Admin escalation notifications (Email + in-app)

**Recommendation**: do **both**, because each covers what the other can't.
- **In-app live notification** (always free, instant when the admin has the app open): real-time toast + bell badge via Supabase **Realtime** subscription on `task_alerts` for rows with `escalate_to_admin = true`. This is the "pop-up" you mentioned and is the most reliable channel because the app is a PWA-style web app — it doesn't need to be "installed".
- **Email** (covers the case the admin isn't in the app): sent via **Lovable Emails** (built-in transactional email infra). Delivered to **all users with role `ADMIN`**.

This gives admins both an instant in-app alert and a durable email audit trail — same trigger event, two channels.

#### C.1 — In-app realtime notifications

- Enable Supabase Realtime on `task_alerts` (migration: `ALTER PUBLICATION supabase_realtime ADD TABLE task_alerts;`, plus `REPLICA IDENTITY FULL`).
- New hook `useAdminEscalationNotifications.ts` (mounted once in `MainLayout` for admins): subscribes to INSERT events on `task_alerts WHERE escalate_to_admin = true`, fires a `sonner` toast with title/category and a "View" action that routes to `/admin-tasks`. Also bumps an unread counter shown as a small dot on the existing TopNavbar bell icon (or adds one if missing).
- Deduped via row id so the same alert doesn't notify twice per session.

#### C.2 — Email to all admins

**Prerequisites** — both are platform tools we'll invoke during build:
1. Lovable Cloud is already enabled (project uses Supabase) ✓
2. `email_domain--setup_email_infra` (sets up queues, tables, cron)
3. `email_domain--scaffold_transactional_email` (creates the generic `send-transactional-email` Edge Function + template registry)

**If no email domain is configured yet**, I'll first show the Email setup dialog (`<lov-open-email-setup>`) so the user can pick a sender subdomain. DNS verification is not required to scaffold or deploy — emails will start flowing once DNS verifies.

**Templates** (React Email, in `_shared/transactional-email-templates/`):
- `escalation-alert.tsx` — branded notification with: alert type label (Financial / Timeline / PM operational / On Hold / etc.), project name + client, PM who raised it, description, scheduled date if any, CTA button → `https://<app>/admin-tasks?alertId=<id>`.

**Trigger** — DB-side, so it fires no matter who creates the alert (UI, trigger, RPC):
- New Postgres trigger `trg_task_alerts_notify_admins` AFTER INSERT on `task_alerts`:
  - Only fires when `NEW.escalate_to_admin = true`.
  - Calls `pg_net.http_post` to a new Edge Function `dispatch-admin-escalation` with `{ alertId }`.
- New Edge Function `dispatch-admin-escalation`:
  - Loads the alert + certification + PM profile.
  - Queries `user_roles WHERE role IN ('ADMIN','admin')` joined with `profiles` to get all admin emails.
  - Loops the admin list and invokes `send-transactional-email` once per admin, with `idempotencyKey = escalation-<alertId>-<adminId>` (one email per alert per admin — safe against retries; not bulk marketing because each is triggered by a specific event).
- Stored as a project secret automatically by `pg_net` setup; no manual secret needed.

**Throttling / safety**:
- The DB trigger is `AFTER INSERT` only (no double-fire on update).
- `idempotencyKey` prevents duplicates if the trigger retries.
- If `escalate_to_admin` flips from `false` to `true` later (UPDATE), an additional `AFTER UPDATE WHEN OLD.escalate_to_admin = false` branch fires the same function.

#### C.3 — Settings toggle

Add a small section in **Settings → Notifications**:
- "Email me on PM/financial escalations" — per-user opt-out (column `notify_escalations_email boolean default true` on `profiles`). The dispatcher Edge Function honours this flag.
- The in-app toast is always on for admins (not opt-out — it's the live alert).

---

### Files

| File | Change |
|---|---|
| **Migration** | `contacts` table + RLS; `profiles.notify_escalations_email`; enable realtime on `task_alerts`; trigger `trg_task_alerts_notify_admins` |
| `supabase/functions/dispatch-admin-escalation/index.ts` | **NEW** — fans out emails to admins via `send-transactional-email` |
| `supabase/functions/_shared/transactional-email-templates/escalation-alert.tsx` | **NEW** — React Email template |
| `supabase/functions/_shared/transactional-email-templates/registry.ts` | created/updated by scaffolder |
| `src/pages/Contacts.tsx` | **NEW** — list + tabs |
| `src/components/contacts/ContactFormDialog.tsx` | **NEW** — create/edit |
| `src/hooks/useContacts.ts` | **NEW** — CRUD queries |
| `src/components/layout/TopNavbar.tsx` | Add `Contacts` nav link; bell with unread dot |
| `src/components/projects/SiteProjectOnboardingForm.tsx` | `+ New Brand` / `+ New Holding` inline forms |
| `src/pages/ProjectCreateWizard.tsx` | Same inline brand/holding creation in Step 1 |
| `src/hooks/useAdminEscalationNotifications.ts` | **NEW** — Realtime subscription + sonner toast |
| `src/components/layout/MainLayout.tsx` | Mount the realtime hook for admins |
| `src/pages/Settings.tsx` | Add "Email me on escalations" toggle |
| `src/App.tsx` | Route `/contacts` |

### Notes
- No third-party email service — uses Lovable's built-in transactional infra.
- Email sending stays compliant: each escalation email is triggered by a specific event and goes to one recipient per send (one admin = one email), not a bulk campaign.
- The admin email list is resolved at send time, so newly added admins are notified automatically.
- All new code is strict TypeScript with typed interfaces in `src/types/custom-tables.ts`; no `as any`.
- Admin gating client-side **and** via RLS for every new mutation.

