## Weekly Canvas Report in MyTimesheet

Add a "Weekly Report" canvas inside `/timesheet` that auto-aggregates hours by certification for the current ISO week, lets PMs (and Admins) edit a free-text summary per project, and locks Sunday 23:59 via cron.

### How it works for the user

- Below the daily list in `MyTimesheet`, a new **"Weekly Report"** section shows the current week (Mon–Sun).
- Auto-populated as **hybrid**: for each certification with ≥1 entry that week, a card appears prefilled with total hours + bullet list of `time_entries.description`. The PM edits/rewrites freely in a textarea.
- One **status pill**: Draft → Saved → Locked.
- "Save report" button persists. On Monday morning, the previous week is read-only with a Locked badge (auto-locked by cron Sunday 23:59 even if not saved — captures current auto-populated state).
- PM can navigate to previous weeks (read-only if locked).
- **Admin** sees a week selector + user selector to view anyone's report, can edit directly, and has an "Unlock" button to let the PM resume editing.

### Database

New table `weekly_reports` — one row per `(user_id, week_start)`:
- `week_start date` (Monday, ISO week)
- `content jsonb` — array of `{ certification_id, hours_snapshot, summary }`
- `status text` — `draft` | `saved` | `locked`
- `locked_at timestamptz`, `last_edited_at timestamptz`
- Unique `(user_id, week_start)`

**RLS**
- User can SELECT/INSERT/UPDATE own rows where `status != 'locked'`
- Admin full access (`is_admin(auth.uid())`)
- Update blocked for owner when locked

**Auto-lock cron** (Sunday 23:59 Europe/Rome):
- Edge function `lock-weekly-reports`: for every user with time entries in that week, upsert a report (auto-snapshot from `time_entries` if missing) and set `status='locked'`.
- Scheduled via `pg_cron` + `pg_net`.

### Frontend

- `src/types/weekly-report.ts` — types.
- `src/hooks/useWeeklyReport.ts` — fetch by `(userId, weekStart)`, autosnapshot helper from time_entries, save mutation, admin unlock mutation.
- `src/components/timesheet/WeeklyReportCanvas.tsx` — week navigator (← current week →), per-cert cards (header: cert name + total hours pill; body: textarea), Save button, Locked badge, Admin unlock button.
- `src/components/timesheet/AdminWeeklyReportsBrowser.tsx` — admin-only: PM picker + week picker, reuses the canvas in admin-edit mode.
- Mount inside `src/pages/MyTimesheet.tsx` below the existing daily list. Admin sees an extra "Team reports" tab.

### Technical notes

- Week math via `date-fns` `startOfISOWeek` / `endOfISOWeek`.
- Snapshot logic: when canvas opens and no report row exists, build content from `time_entries` grouped by `certification_id`; persisted only on first save.
- Owner update policy uses `status <> 'locked' OR is_admin(auth.uid())` in the USING/WITH CHECK.
- Cron job hits the edge function with anon key + service-role internally; function uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS during auto-lock.
- Memory update: extend `mem://features/time-tracking` with the weekly report behavior and auto-lock rule.

### Rollout

1. Migration: `weekly_reports` + RLS + indexes.
2. Edge function `lock-weekly-reports` + pg_cron schedule (Sun 23:59).
3. Frontend canvas + hook + integration into `MyTimesheet`.
4. Admin browser tab.
5. Memory update.