export type Profile = {
  id: string;
  full_name: string;
  email: string;
  employee_id: string | null;
  role: string;
  department: string;
  designation: string;
  location: string;
  avatar_url: string | null;
  theme: 'light' | 'dark' | 'system';
  phone?: string | null;
  personal_email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  address?: string | null;
  reports_to?: string | null;
  shift_id?: string | null;
};

export type Attendance = {
  id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  break_start: string | null;
  break_end: string | null;
  total_break_minutes: number;
  notes?: string | null;
};

export type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
};

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export type RegularizationRequest = {
  id: string;
  user_id: string;
  work_date: string;
  reason: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  status: string;
  reviewer_note: string | null;
  created_at: string;
};

export type OvertimeRequest = {
  id: string;
  user_id: string;
  work_date: string;
  hours_requested: number;
  reason: string;
  status: string;
  reviewer_note: string | null;
  created_at: string;
};

export type PayrollRecord = {
  id: string;
  pay_month: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  status: string;
  storage_path: string | null;
};

export type DocumentRecord = {
  id: string;
  name: string;
  category: string;
  storage_path: string;
  status: string;
  expiry_date: string | null;
  created_at: string;
};

export type EmployeePresence = {
  id: string;
  full_name: string;
  designation: string;
  department: string;
  avatar_url: string | null;
  today_status: string;
};

export type Holiday = {
  id: string;
  name: string;
  holiday_date: string;
};

export type View = 'Overview' | 'Attendance' | 'Leave' | 'Documents' | 'People' | 'Reports' | 'Settings';

export type AttendanceTab = 'list' | 'regularization' | 'overtime' | 'shifts';
export type DocumentsTab = 'documents' | 'payslips';
