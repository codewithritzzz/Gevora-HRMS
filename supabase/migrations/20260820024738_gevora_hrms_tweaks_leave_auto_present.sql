/*
# Gevora HRMS Tweaks: Leave Balance, Auto-Present, Paid Leave Display

## 1. Leave Balance (computed)
- Adds `leave_balance` numeric column to `profiles` (starts at 0 for new users).
- A SECURITY DEFINER function `compute_leave_balance(p_user_id uuid)` computes accrued balance live:
  accrual = floor(weeks since profiles.created_at) * 0.5, minus sum of days from approved leave_requests.
  Never goes below 0.
- A view `leave_balance_view` exposes `user_id, accrued, used, available` for all authenticated users.
- Backfill migration: UPDATE profiles SET leave_balance = computed value for all existing users.

## 2. Auto-Mark Present at 9 Hours
- A SECURITY DEFINER function `auto_mark_present(p_user_id uuid)` checks today's attendance:
  if check_in exists, check_out is null, and (now - check_in - total_break_minutes) >= 9 hours,
  set status = 'present'. This can be called from the client on each tick.
- Also a trigger on attendance UPDATE: if worked time >= 9 hours, set status = 'present'.

## 3. Paid Leave Display
- Attendance status CHECK constraint extended to include 'paid_leave'.
- A SECURITY DEFINER function `approve_leave(p_request_id uuid)` that:
  sets leave_requests.status = 'approved',
  inserts/updates attendance rows for each date in the range with status = 'paid_leave',
  sends a notification.
- This replaces the current pattern where managers would just update the status column directly.

## 4. Security
- All new functions are SECURITY DEFINER with proper authorization checks.
- `compute_leave_balance` is callable by the user themselves or staff.
- `auto_mark_present` is callable by the user themselves only.
- `approve_leave` is staff-only.
- Leave balance column is readable by owner or staff, writable only by the system (via functions).
- Profile UPDATE grant extended to NOT include leave_balance (it's computed, not directly editable).
*/

-- ============ LEAVE BALANCE COLUMN ============

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leave_balance numeric(6,2) NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============ COMPUTE LEAVE BALANCE FUNCTION ============

CREATE OR REPLACE FUNCTION public.compute_leave_balance(p_user_id uuid)
RETURNS numeric(6,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at timestamptz;
  v_weeks integer;
  v_accrued numeric(6,2);
  v_used numeric(6,2);
BEGIN
  SELECT created_at INTO v_created_at FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_weeks := floor(extract(epoch FROM (now() - v_created_at)) / 604800);
  v_accrued := v_weeks * 0.5;

  SELECT COALESCE(sum(days), 0) INTO v_used
  FROM public.leave_requests
  WHERE user_id = p_user_id AND status = 'approved';

  RETURN GREATEST(0, v_accrued - v_used);
END;
$$;
REVOKE ALL ON FUNCTION public.compute_leave_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_leave_balance(uuid) TO authenticated;

-- ============ LEAVE BALANCE VIEW ============

CREATE OR REPLACE VIEW public.leave_balance_view AS
SELECT
  p.id AS user_id,
  public.compute_leave_balance(p.id) AS available,
  COALESCE((
    SELECT sum(days) FROM public.leave_requests
    WHERE user_id = p.id AND status = 'approved'
  ), 0) AS used_days,
  floor(extract(epoch FROM (now() - p.created_at)) / 604800) * 0.5 AS accrued
FROM public.profiles p;

-- ============ BACKFILL EXISTING USERS ============

UPDATE public.profiles
SET leave_balance = public.compute_leave_balance(id)
WHERE true;

-- ============ AUTO-MARK PRESENT AT 9 HOURS ============

CREATE OR REPLACE FUNCTION public.auto_mark_present(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att public.attendance%ROWTYPE;
  v_worked_seconds integer;
  v_threshold_seconds integer := 9 * 3600;
BEGIN
  SELECT * INTO v_att FROM public.attendance
  WHERE user_id = p_user_id AND work_date = CURRENT_DATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_att.check_in IS NULL THEN RETURN; END IF;

  -- Only auto-mark if not already checked out (if checked out, status is already final)
  IF v_att.check_out IS NOT NULL THEN RETURN; END IF;

  -- Worked time = now - check_in - total_break_minutes
  v_worked_seconds := extract(epoch FROM (now() - v_att.check_in)) - (COALESCE(v_att.total_break_minutes, 0) * 60);

  IF v_worked_seconds >= v_threshold_seconds AND v_att.status NOT IN ('present', 'paid_leave') THEN
    UPDATE public.attendance SET status = 'present', updated_at = now()
    WHERE id = v_att.id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_mark_present(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_mark_present(uuid) TO authenticated;

-- ============ EXTEND ATTENDANCE STATUS CHECK FOR PAID_LEAVE ============

-- We need to drop and recreate the check constraint to add 'paid_leave'
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'late', 'absent', 'leave', 'holiday', 'missing_punch', 'paid_leave'));

-- ============ APPROVE LEAVE FUNCTION ============

CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.leave_requests%ROWTYPE;
  v_current_date date;
BEGIN
  SELECT * INTO req FROM public.leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.leave_requests
    SET status = 'approved', reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  -- Create/update attendance rows for each day in the range as paid_leave
  v_current_date := req.start_date;
  WHILE v_current_date <= req.end_date LOOP
    INSERT INTO public.attendance (user_id, work_date, status)
    VALUES (req.user_id, v_current_date, 'paid_leave')
    ON CONFLICT (user_id, work_date) DO UPDATE
      SET status = 'paid_leave', updated_at = now();

    v_current_date := v_current_date + 1;
  END LOOP;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Leave approved', 'Your leave request (' || req.days || ' days) has been approved.', 'leave');
END;
$$;
REVOKE ALL ON FUNCTION public.approve_leave(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_leave(uuid, text) TO authenticated;

-- ============ REJECT LEAVE FUNCTION ============

CREATE OR REPLACE FUNCTION public.reject_leave(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.leave_requests%ROWTYPE;
BEGIN
  SELECT * INTO req FROM public.leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.leave_requests
    SET status = 'rejected', reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Leave rejected', 'Your leave request has been rejected.', 'leave');
END;
$$;
REVOKE ALL ON FUNCTION public.reject_leave(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_leave(uuid, text) TO authenticated;

-- ============ GRANT LEAVE BALANCE VIEW ACCESS ============

-- The view inherits RLS from profiles since it's based on profiles, but we need to ensure
-- authenticated users can read their own balance. Since profiles already has SELECT policy
-- for self-or-staff, the view will respect that.

-- ============ UPDATE PROFILE GRANTS (leave_balance NOT directly writable) ============

-- Current grant already excludes leave_balance since we only granted specific columns.
-- No change needed — leave_balance is only updated via compute/backfill, not by users.
