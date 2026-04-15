

## Add "Canvas" (Project Journal) to Project Detail

### What it does

A new **Canvas** tab on the project detail page acts as a chronological journal for the project. It displays timestamped, attributed entries — meeting minutes pasted by the PM, admin support requests (auto-generated from escalated alerts), and admin notes. Both PM and Admin can add entries. Each entry shows who wrote it and when (e.g., "Shikha has updated the canvas on 15/04/2026 at 14:30").

### Database

**New table: `project_canvas_entries`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| certification_id | uuid FK → certifications | |
| author_id | uuid FK → profiles(id) | who wrote it |
| entry_type | text | `meeting_minutes`, `admin_support_request`, `admin_note`, `general` |
| content | text | the actual text/minutes |
| source_alert_id | uuid nullable | links to task_alerts if auto-generated from an escalation |
| created_at | timestamptz | |

**RLS policies:**
- SELECT: authenticated users who are admin OR PM of the certification
- INSERT: authenticated users (author_id = auth.uid())
- UPDATE: only the author (author_id = auth.uid()) or admin

**Auto-entry trigger:** When a `task_alerts` row is inserted with `escalate_to_admin = true`, a trigger inserts a canvas entry of type `admin_support_request` with the alert title/description. Similarly, when Admin creates an alert on the project, a canvas entry is auto-created.

### Frontend

#### 1. New component: `src/components/projects/ProjectCanvas.tsx`

- Receives `certificationId` as prop
- Fetches entries from `project_canvas_entries` ordered by `created_at DESC`, joined with `profiles` for author name
- Displays a timeline of entries, each showing:
  - Author avatar/name + timestamp header (e.g., "Shikha has updated the canvas on 15/04/2026 at 14:30")
  - Entry type badge (Meeting Minutes, Support Request, Admin Note)
  - Content text (rendered as markdown or plain text with line breaks)
- "Add Entry" button opens a form with:
  - Type selector (Meeting Minutes / General Note)
  - Textarea for content
  - Submit inserts into `project_canvas_entries`

#### 2. Update `src/pages/ProjectDetail.tsx`

- Add `Canvas` tab trigger after Payments
- Add `TabsContent` rendering `<ProjectCanvas certificationId={projectId} />`

### Files Modified

| File | Change |
|------|--------|
| DB migration | Create `project_canvas_entries` table + RLS + auto-entry trigger |
| `src/components/projects/ProjectCanvas.tsx` | New component — journal timeline + add entry form |
| `src/pages/ProjectDetail.tsx` | Add Canvas tab |

