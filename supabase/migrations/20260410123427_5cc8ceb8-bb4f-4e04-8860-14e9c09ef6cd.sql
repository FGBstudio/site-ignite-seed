-- Add columns to certification_milestones for role-based edit locks and actual completion date
ALTER TABLE certification_milestones
  ADD COLUMN IF NOT EXISTS edit_locked_for_pm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_date date;

-- Add columns to certifications for dual handover tracking
ALTER TABLE certifications
  ADD COLUMN IF NOT EXISTS planned_handover_date date,
  ADD COLUMN IF NOT EXISTS actual_handover_date date;