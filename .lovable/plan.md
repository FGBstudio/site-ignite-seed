

## Fix: Inventory Breakdown & Demand Analysis — Empty Data

### Root Cause

Both `Inventory.tsx` and `ProcurementForecasting.tsx` fail to display allocation data because:

1. **Inventory dialog** (line 74-84) uses `projects!inner(name, client, region, status)` as a PostgREST join — but `project_allocations` has **no foreign key** to `projects`. The column is `certification_id`, which references `certifications`. PostgREST silently returns zero rows when it cannot resolve the relationship.

2. **Demand Analysis** fetches from `projects` table and tries to match allocations via `certification_id`, but `projects.id` and `certifications.id` are **different UUIDs**. The allocations point to `certifications`, not `projects`. The join `projectIds.has((a as any).certification_id)` fails because `projects.id !== certifications.id`.

3. **useDashboardData.ts** has the same bug — it matches `projects.find(p => p.id === (a as any).certification_id)` which will never match.

### Fix Plan

#### 1. Fix Inventory Dialog (`src/pages/Inventory.tsx`)

Replace the PostgREST join (`projects!inner(...)`) with a two-step fetch:
- Fetch allocations for the product (plain `select("*")`)
- Fetch matching certifications by their IDs (`certifications` table, not `projects`)
- Map allocation data with certification name/client/region

#### 2. Fix Demand Analysis (`src/components/dashboard/ProcurementForecasting.tsx`)

Replace `projects` fetch with `certifications` fetch:
- Change `supabase.from("projects")` to `supabase.from("certifications")`
- Filter by active statuses (`in_progress`, etc.)
- Use `certification_id` matching correctly since allocations reference certifications

#### 3. Fix Dashboard Hook (`src/hooks/useDashboardData.ts`)

Same fix — replace `projects` with `certifications` for the join logic. Match `allocations.certification_id` against `certifications.id`.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/Inventory.tsx` | Replace PostgREST join with separate certifications fetch |
| `src/components/dashboard/ProcurementForecasting.tsx` | Query `certifications` instead of `projects`; fix ID matching |
| `src/hooks/useDashboardData.ts` | Query `certifications` instead of `projects`; fix ID matching |

### No DB migration needed

The data and schema are correct. The bug is purely in the frontend query logic using the wrong table.

