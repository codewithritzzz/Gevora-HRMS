/*
# Gevora HRMS Feature Expansion

## 1. New Tables
- `holidays`: company holidays by date.
- `regularization_requests`: employee requests to correct missing/wrong attendance punches; routed to manager for approval.
- `overtime_requests`: employee overtime requests capped at 6 hours; routed to manager for approval.
- `shifts`: named shift definitions with start/end times.
- `breaks`: individual break records per attendance day (start/end timestamps).

## 2. New Columns on Existing Tables
- `profiles`: `reports_to uuid` (self-referencing FK for org hierarchy), `phone text`, `personal_email text`, `emergency_contact_name text`, `emergency_contact_number text`, `address text`, `shift_id uuid` FK to shifts.
- `attendance`: `break_start timestamptz`, `break_end timestamptz`, `total_break_minutes numeric(5,2) DEFAULT 0`.
- `payroll_records`: `storage_path text` (for payslip file attachment).

## 3. New View
- `employee_presence`: exposes only `id, full_name, designation, department, avatar_url, today_status` for all authenticated users — a safe, minimal directory without sensitive fields.

## 4. Storage
- New public `avatars` bucket for profile pictures, scoped per-user.

## 5. Security (RLS)
- All new tables get RLS with owner-scoped policies using auth.uid(), following the same pattern as existing tables.
- Staff (MANAGER/HR/PAYROLL/ADMIN/SUPER_ADMIN) get read access on all employee data and write access on requests they need to approve.
- `employee_presence` view is readable by all authenticated users.
- `avatars` bucket: users read/write their own folder, all authenticated users can read (public avatars).
- `employee-documents` bucket policies extended so staff can write to any employee's folder.
- Profile UPDATE grant extended to include new columns (phone, personal_email, emergency_contact_*, address, avatar_url, shift_id is staff-only via set_profile_shift function).

## 6. Important Notes
- All changes are additive and safe to re-run (IF NOT EXISTS, DROP POLICY IF EXISTS).
- No data is lost; existing columns are not modified or removed.
- A default "General" shift (9 AM - 6 PM) is inserted.
- A SECURITY DEFINER function `set_profile_shift` allows staff to assign shifts.
- A SECURITY DEFINER function `approve_regularization` and `reject_regularization` handle the approval workflow atomically.
- A SECURITY DEFINER function `approve_overtime` and `reject_overtime` handle the overtime approval workflow.
*/

-- ============ NEW TABLES ============

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.regularization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('Forgot to check in', 'Forgot to check out', 'Wrong check-in time', 'System/network issue', 'Approved WFH not logged', 'Other')),
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  hours_requested numeric(4,2) NOT NULL CHECK (hours_requested > 0 AND hours_requested <= 6),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL,
  break_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ NEW COLUMNS ON EXISTING TABLES ============

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_email text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact_name text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact_number text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS break_start timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS break_end timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_break_minutes numeric(5,2) NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS storage_path text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS regularization_user_date_idx ON public.regularization_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS regularization_status_idx ON public.regularization_requests(status);
CREATE INDEX IF NOT EXISTS overtime_user_date_idx ON public.overtime_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS overtime_status_idx ON public.overtime_requests(status);
CREATE INDEX IF NOT EXISTS breaks_attendance_idx ON public.breaks(attendance_id);
CREATE INDEX IF NOT EXISTS profiles_reports_to_idx ON public.profiles(reports_to);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays(holiday_date);

-- ============ DEFAULT SHIFT ============

INSERT INTO public.shifts (name, start_time, end_time)
VALUES ('General', '09:00', '18:00')
ON CONFLICT DO NOTHING;

-- ============ EMPLOYEE PRESENCE VIEW ============

CREATE OR REPLACE VIEW public.employee_presence AS
SELECT
  p.id,
  p.full_name,
  p.designation,
  p.department,
  p.avatar_url,
  CASE
    WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL THEN 'checked_out'
    WHEN a.check_in IS NOT NULL AND a.break_start IS NOT NULL AND a.break_end IS NULL THEN 'on_break'
    WHEN a.check_in IS NOT NULL THEN 'checked_in'
    ELSE 'not_checked_in'
  END AS today_status
FROM public.profiles p
LEFT JOIN public.attendance a
  ON a.user_id = p.id AND a.work_date = CURRENT_DATE;

-- ============ RLS ON NEW TABLES ============

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regularization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;

-- holidays: all authenticated can read, staff can write
DROP POLICY IF EXISTS "holidays_select_authenticated" ON public.holidays;
CREATE POLICY "holidays_select_authenticated" ON public.holidays FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "holidays_insert_staff" ON public.holidays;
CREATE POLICY "holidays_insert_staff" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "holidays_update_staff" ON public.holidays;
CREATE POLICY "holidays_update_staff" ON public.holidays FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "holidays_delete_staff" ON public.holidays;
CREATE POLICY "holidays_delete_staff" ON public.holidays FOR DELETE TO authenticated USING (public.is_staff());

-- shifts: all authenticated can read, staff can write
DROP POLICY IF EXISTS "shifts_select_authenticated" ON public.shifts;
CREATE POLICY "shifts_select_authenticated" ON public.shifts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "shifts_insert_staff" ON public.shifts;
CREATE POLICY "shifts_insert_staff" ON public.shifts FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "shifts_update_staff" ON public.shifts;
CREATE POLICY "shifts_update_staff" ON public.shifts FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "shifts_delete_staff" ON public.shifts;
CREATE POLICY "shifts_delete_staff" ON public.shifts FOR DELETE TO authenticated USING (public.is_staff());

-- regularization_requests: owner + staff read; owner insert; staff update (approve/reject)
DROP POLICY IF EXISTS "regularization_select_self_or_staff" ON public.regularization_requests;
CREATE POLICY "regularization_select_self_or_staff" ON public.regularization_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "regularization_insert_self" ON public.regularization_requests;
CREATE POLICY "regularization_insert_self" ON public.regularization_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "regularization_update_staff" ON public.regularization_requests;
CREATE POLICY "regularization_update_staff" ON public.regularization_requests FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "regularization_delete_self" ON public.regularization_requests;
CREATE POLICY "regularization_delete_self" ON public.regularization_requests FOR DELETE TO authenticated USING (user_id = auth.uid());

-- overtime_requests: same pattern
DROP POLICY IF EXISTS "overtime_select_self_or_staff" ON public.overtime_requests;
CREATE POLICY "overtime_select_self_or_staff" ON public.overtime_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "overtime_insert_self" ON public.overtime_requests;
CREATE POLICY "overtime_insert_self" ON public.overtime_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "overtime_update_staff" ON public.overtime_requests;
CREATE POLICY "overtime_update_staff" ON public.overtime_requests FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "overtime_delete_self" ON public.overtime_requests;
CREATE POLICY "overtime_delete_self" ON public.overtime_requests FOR DELETE TO authenticated USING (user_id = auth.uid());

-- breaks: owner + staff read; owner insert; owner + staff update
DROP POLICY IF EXISTS "breaks_select_self_or_staff" ON public.breaks;
CREATE POLICY "breaks_select_self_or_staff" ON public.breaks FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "breaks_insert_self" ON public.breaks;
CREATE POLICY "breaks_insert_self" ON public.breaks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "breaks_update_self" ON public.breaks;
CREATE POLICY "breaks_update_self" ON public.breaks FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "breaks_delete_self" ON public.breaks;
CREATE POLICY "breaks_delete_self" ON public.breaks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ PROFILE GRANT UPDATES ============

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, department, designation, location, avatar_url, theme, phone, personal_email, emergency_contact_name, emergency_contact_number, address) ON public.profiles TO authenticated;

-- ============ SECURITY DEFINER FUNCTIONS ============

CREATE OR REPLACE FUNCTION public.set_profile_shift(p_user_id uuid, p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET shift_id = p_shift_id, updated_at = now() WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_profile_shift(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_shift(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_reports_to(p_user_id uuid, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET reports_to = p_manager_id, updated_at = now() WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_reports_to(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_reports_to(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_regularization(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.regularization_requests;
BEGIN
  SELECT * INTO req FROM public.regularization_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.regularization_requests
    SET status = 'approved', reviewer_id = auth.uid(), reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  -- Update or create attendance row
  INSERT INTO public.attendance (user_id, work_date, check_in, check_out, status)
  VALUES (req.user_id, req.work_date, req.requested_check_in, req.requested_check_out, 'present')
  ON CONFLICT (user_id, work_date) DO UPDATE
    SET check_in = COALESCE(req.requested_check_in, public.attendance.check_in),
        check_out = COALESCE(req.requested_check_out, public.attendance.check_out),
        status = 'present',
        updated_at = now();

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Regularization approved', 'Your regularization request was approved.', 'regularization');
END;
$$;
REVOKE ALL ON FUNCTION public.approve_regularization(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_regularization(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_regularization(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.regularization_requests;
BEGIN
  SELECT * INTO req FROM public.regularization_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.regularization_requests
    SET status = 'rejected', reviewer_id = auth.uid(), reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Regularization rejected', 'Your regularization request was rejected.', 'regularization');
END;
$$;
REVOKE ALL ON FUNCTION public.reject_regularization(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_regularization(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_overtime(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.overtime_requests;
BEGIN
  SELECT * INTO req FROM public.overtime_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.overtime_requests
    SET status = 'approved', reviewer_id = auth.uid(), reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Overtime approved', 'Your overtime request was approved.', 'overtime');
END;
$$;
REVOKE ALL ON FUNCTION public.approve_overtime(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_overtime(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_overtime(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.overtime_requests;
BEGIN
  SELECT * INTO req FROM public.overtime_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.overtime_requests
    SET status = 'rejected', reviewer_id = auth.uid(), reviewer_note = p_note, updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (req.user_id, 'Overtime rejected', 'Your overtime request was rejected.', 'overtime');
END;
$$;
REVOKE ALL ON FUNCTION public.reject_overtime(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_overtime(uuid, text) TO authenticated;

-- ============ AVATARS STORAGE BUCKET ============

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_read_all" ON storage.objects;
CREATE POLICY "avatars_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ EXTEND employee-documents FOR STAFF WRITES ============

DROP POLICY IF EXISTS "documents_storage_insert_staff" ON storage.objects;
CREATE POLICY "documents_storage_insert_staff" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-documents' AND (public.is_staff() OR (storage.foldername(name))[1] = auth.uid()::text));

DROP POLICY IF EXISTS "documents_storage_select_own_or_staff" ON storage.objects;
CREATE POLICY "documents_storage_select_own_or_staff" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'employee-documents' AND (public.is_staff() OR (storage.foldername(name))[1] = auth.uid()::text));

DROP POLICY IF EXISTS "documents_storage_update_staff" ON storage.objects;
CREATE POLICY "documents_storage_update_staff" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'employee-documents' AND public.is_staff()) WITH CHECK (bucket_id = 'employee-documents' AND public.is_staff());

DROP POLICY IF EXISTS "documents_storage_delete_own_or_staff" ON storage.objects;
CREATE POLICY "documents_storage_delete_own_or_staff" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'employee-documents' AND (public.is_staff() OR (storage.foldername(name))[1] = auth.uid()::text));

-- Update payroll insert policy to also allow storage_path
-- (existing payroll_insert_staff policy already covers this since is_staff check is unchanged)
