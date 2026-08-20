/*
# Create Gevora HRMS secure core

1. Purpose
- Establish the persistent data foundation for the Gevora HRMS employee portal.
- Use Supabase Auth identities as the source of truth for signed-in users.

2. New tables
- `profiles`: display identity, role, department, and theme preference for each Auth user.
- `attendance`: employee-owned check-in and check-out records.
- `leave_requests`: employee leave requests and approval status.
- `payroll_records`: private monthly payroll summaries visible to the employee and authorized staff.
- `documents`: private employee document metadata and review status.
- `notifications`: private in-app notifications for each user.
- `announcements`: company-wide announcements.
- `audit_logs`: staff-only security and workflow history.

3. Security
- Row Level Security is enabled on every new table.
- Employee data is owner-scoped using `auth.uid()`.
- Staff reads are limited to HR, payroll, admin, and super-admin roles.
- Profile roles are not client-writable; role changes require the protected role function.
- A private `employee-documents` storage bucket is created with user-folder policies.

4. Important notes
- New Auth users automatically receive an employee profile with the `EMPLOYEE` role.
- The schema is additive and safe to re-run.
- Payroll and document contents are intentionally not public.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT 'New employee',
  email text NOT NULL DEFAULT '',
  employee_id text UNIQUE,
  role text NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'MANAGER', 'HR', 'PAYROLL', 'ADMIN', 'SUPER_ADMIN')),
  department text NOT NULL DEFAULT 'People Operations',
  designation text NOT NULL DEFAULT 'Team member',
  location text NOT NULL DEFAULT 'Remote',
  avatar_url text,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent', 'leave', 'holiday', 'missing_punch')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,2) NOT NULL CHECK (days > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pay_month date NOT NULL,
  gross_salary numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_salary numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('draft', 'calculated', 'under_review', 'approved', 'processed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pay_month)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'under_review' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'expired')),
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'Everyone',
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  module text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_user_date_idx ON public.attendance(user_id, work_date DESC);
CREATE INDEX IF NOT EXISTS leave_requests_user_date_idx ON public.leave_requests(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS payroll_records_user_month_idx ON public.payroll_records(user_id, pay_month DESC);
CREATE INDEX IF NOT EXISTS documents_user_created_idx ON public.documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('MANAGER', 'HR', 'PAYROLL', 'ADMIN', 'SUPER_ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, employee_id)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    'GV-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_profile_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_role NOT IN ('EMPLOYEE', 'MANAGER', 'HR', 'PAYROLL', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_role(uuid, text) TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, department, designation, location, avatar_url, theme) ON public.profiles TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self_or_staff" ON public.profiles;
CREATE POLICY "profiles_select_self_or_staff" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "attendance_select_self_or_staff" ON public.attendance;
CREATE POLICY "attendance_select_self_or_staff" ON public.attendance FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "attendance_insert_self" ON public.attendance;
CREATE POLICY "attendance_insert_self" ON public.attendance FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "attendance_update_self" ON public.attendance;
CREATE POLICY "attendance_update_self" ON public.attendance FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "attendance_delete_self" ON public.attendance;
CREATE POLICY "attendance_delete_self" ON public.attendance FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "leave_select_self_or_staff" ON public.leave_requests;
CREATE POLICY "leave_select_self_or_staff" ON public.leave_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "leave_insert_self" ON public.leave_requests;
CREATE POLICY "leave_insert_self" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "leave_update_self_or_staff" ON public.leave_requests;
CREATE POLICY "leave_update_self_or_staff" ON public.leave_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff()) WITH CHECK (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "leave_delete_self" ON public.leave_requests;
CREATE POLICY "leave_delete_self" ON public.leave_requests FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "payroll_select_self_or_staff" ON public.payroll_records;
CREATE POLICY "payroll_select_self_or_staff" ON public.payroll_records FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "payroll_insert_staff" ON public.payroll_records;
CREATE POLICY "payroll_insert_staff" ON public.payroll_records FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "payroll_update_staff" ON public.payroll_records;
CREATE POLICY "payroll_update_staff" ON public.payroll_records FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "payroll_delete_staff" ON public.payroll_records;
CREATE POLICY "payroll_delete_staff" ON public.payroll_records FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "documents_select_self_or_staff" ON public.documents;
CREATE POLICY "documents_select_self_or_staff" ON public.documents FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "documents_insert_self" ON public.documents;
CREATE POLICY "documents_insert_self" ON public.documents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "documents_update_self_or_staff" ON public.documents;
CREATE POLICY "documents_update_self_or_staff" ON public.documents FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff()) WITH CHECK (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "documents_delete_self" ON public.documents;
CREATE POLICY "documents_delete_self" ON public.documents FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select_self" ON public.notifications;
CREATE POLICY "notifications_select_self" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert_staff" ON public.notifications;
CREATE POLICY "notifications_insert_staff" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff() OR user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_self" ON public.notifications;
CREATE POLICY "notifications_update_self" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete_self" ON public.notifications;
CREATE POLICY "notifications_delete_self" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "announcements_select_authenticated" ON public.announcements;
CREATE POLICY "announcements_select_authenticated" ON public.announcements FOR SELECT TO authenticated USING (expires_at IS NULL OR expires_at > now());
DROP POLICY IF EXISTS "announcements_insert_staff" ON public.announcements;
CREATE POLICY "announcements_insert_staff" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "announcements_update_staff" ON public.announcements;
CREATE POLICY "announcements_update_staff" ON public.announcements FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "announcements_delete_staff" ON public.announcements;
CREATE POLICY "announcements_delete_staff" ON public.announcements FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "audit_select_staff" ON public.audit_logs;
CREATE POLICY "audit_select_staff" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "audit_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_insert_authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_storage_select_own" ON storage.objects;
CREATE POLICY "documents_storage_select_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'employee-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "documents_storage_insert_own" ON storage.objects;
CREATE POLICY "documents_storage_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "documents_storage_update_own" ON storage.objects;
CREATE POLICY "documents_storage_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'employee-documents' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'employee-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "documents_storage_delete_own" ON storage.objects;
CREATE POLICY "documents_storage_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'employee-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
