
-- Read a batch of messages from a pgmq queue
CREATE OR REPLACE FUNCTION public.read_email_batch(
  queue_name text,
  batch_size int DEFAULT 10,
  visibility_timeout int DEFAULT 30
)
RETURNS TABLE(msg_id bigint, read_ct int, enqueued_at timestamptz, vt timestamptz, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue name: %', queue_name;
  END IF;
  RETURN QUERY
  SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  FROM pgmq.read(queue_name, visibility_timeout, batch_size) r;
END;
$$;

REVOKE ALL ON FUNCTION public.read_email_batch(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, int, int) TO service_role;

-- Delete a message from a pgmq queue
CREATE OR REPLACE FUNCTION public.delete_email(
  queue_name text,
  msg_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
DECLARE
  result boolean;
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue name: %', queue_name;
  END IF;
  SELECT pgmq.delete(queue_name, msg_id) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

-- Move a failed message to its dead-letter queue
CREATE OR REPLACE FUNCTION public.move_to_dlq(
  queue_name text,
  msg_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
DECLARE
  archived boolean;
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue name: %', queue_name;
  END IF;
  -- Archive removes it from the active queue and copies to <queue>_archive
  SELECT pgmq.archive(queue_name, msg_id) INTO archived;
  RETURN archived;
END;
$$;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, bigint) TO service_role;
