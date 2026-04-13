-- Add scheduled_date column to task_alerts for calendar positioning
ALTER TABLE public.task_alerts ADD COLUMN scheduled_date date;