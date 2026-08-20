'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  full_name: string;
  email: string;
  employee_id: string | null;
  role: string;
  department: string;
  designation: string;
  location: string;
  theme: 'light' | 'dark' | 'system';
};

type Attendance = {
  id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
};

type View = 'Overview' | 'Attendance' | 'Leave' | 'Payslips' | 'Documents' | 'People' | 'Reports' | 'Settings';

const navItems: Array<{ label: View; icon: typeof LayoutDashboard; staffOnly?: boolean }> = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Attendance', icon: Clock3 },
  { label: 'Leave', icon: CalendarDays },
  { label: 'Payslips', icon: CreditCard },
  { label: 'Documents', icon: FileText },
  { label: 'People', icon: Users, staffOnly: true },
  { label: 'Reports', icon: Activity, staffOnly: true },
  { label: 'Settings', icon: Settings },
];

const formatTime = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export default function GevoraApp() {
  const [session, setSession] = useState<NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']> | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [view, setView] = useState<View>('Overview');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  const isStaff = ['MANAGER', 'HR', 'PAYROLL', 'ADMIN', 'SUPER_ADMIN'].includes(profile?.role ?? '');
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    void loadWorkspace(session.user.id);
  }, [session]);

  useEffect(() => {
    const resolvedTheme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [theme]);

  const loadWorkspace = async (userId: string) => {
    const [profileResponse, attendanceResponse, leaveResponse, notificationResponse] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('attendance').select('*').eq('user_id', userId).eq('work_date', new Date().toISOString().slice(0, 10)).maybeSingle(),
      supabase.from('leave_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
    ]);
    if (profileResponse.data) {
      setProfile(profileResponse.data as Profile);
      setTheme((profileResponse.data as Profile).theme ?? 'system');
    }
    setAttendance((attendanceResponse.data as Attendance | null) ?? null);
    setLeaveRequests((leaveResponse.data as LeaveRequest[] | null) ?? []);
    setNotifications((notificationResponse.data as Notification[] | null) ?? []);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true); setAuthError(''); setAuthMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const fullName = String(form.get('fullName') ?? '').trim();
    let errorMessage = '';
    if (authMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
      if (error) errorMessage = error.message.includes('rate limit') ? 'Too many attempts. Please wait a minute and try again.' : 'We could not send the reset email. Please try again.';
      else setAuthMessage('If that email is registered, a reset link is on its way.');
    } else if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) {
        console.error('Signup error:', error);
        if (error.message.includes('already') || error.message.includes('registered')) errorMessage = 'An account with this email already exists. Try signing in instead.';
        else if (error.message.includes('weak') || error.message.includes('password')) errorMessage = 'Please choose a stronger password (at least 8 characters).';
        else errorMessage = `Sign up failed: ${error.message}`;
      } else if (data.session) {
        setAuthMessage('Account created. Welcome to Gevora HRMS.');
      } else if (data.user) {
        setAuthMode('signin');
        setAuthMessage('Account created. Please sign in with your email and password to continue.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Signin error:', error);
        if (error.message.includes('Email not confirmed')) errorMessage = 'Please confirm your email first — check your inbox for a verification link, then sign in.';
        else if (error.message.includes('rate limit')) errorMessage = 'Too many attempts. Please wait a minute and try again.';
        else errorMessage = `Sign in failed: ${error.message}`;
      }
    }
    setAuthError(errorMessage);
    setAuthBusy(false);
  };

  const checkIn = async () => {
    if (!session?.user || attendance?.check_in) return;
    const { data, error } = await supabase.from('attendance').insert({ work_date: new Date().toISOString().slice(0, 10), check_in: new Date().toISOString(), status: 'present' }).select().maybeSingle();
    if (!error && data) setAttendance(data as Attendance);
  };

  const checkOut = async () => {
    if (!attendance?.id || attendance.check_out) return;
    const { data, error } = await supabase.from('attendance').update({ check_out: new Date().toISOString() }).eq('id', attendance.id).select().maybeSingle();
    if (!error && data) setAttendance(data as Attendance);
  };

  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate'));
    const endDate = String(form.get('endDate'));
    const reason = String(form.get('reason'));
    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const { data, error } = await supabase.from('leave_requests').insert({ leave_type: String(form.get('leaveType')), start_date: startDate, end_date: endDate, days, reason, status: 'pending' }).select().maybeSingle();
    if (!error && data) {
      setLeaveRequests((current) => [data as LeaveRequest, ...current]);
      setShowLeaveForm(false);
    }
  };

  const saveTheme = async (nextTheme: 'light' | 'dark' | 'system') => {
    setTheme(nextTheme);
    if (profile) await supabase.from('profiles').update({ theme: nextTheme }).eq('id', profile.id);
  };

  const markNotificationsRead = async () => {
    if (!session?.user || unreadCount === 0) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', session.user.id).is('read_at', null);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  };

  if (authLoading) return <div className="loading-screen"><div className="brand-mark"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora" /></div><span>Preparing your workspace…</span></div>;
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} busy={authBusy} error={authError} message={authMessage} />;

  const activeView = view === 'Overview' ? <Overview profile={profile} attendance={attendance} leaveRequests={leaveRequests} onCheckIn={checkIn} onCheckOut={checkOut} onApplyLeave={() => setShowLeaveForm(true)} greeting={greeting} isStaff={isStaff} /> : <WorkspaceView view={view} profile={profile} attendance={attendance} leaveRequests={leaveRequests} isStaff={isStaff} onApplyLeave={() => setShowLeaveForm(true)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${showMobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div><div><strong>Gevora</strong><span>HRMS</span></div><button className="icon-button mobile-close" onClick={() => setShowMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="workspace-pill"><div className="workspace-avatar">G</div><div><b>Gevora Holdings</b><small>People workspace</small></div><ChevronDown size={15} /></div>
        <nav className="main-nav" aria-label="Main navigation">
          <small className="nav-label">Workspace</small>
          {navItems.filter((item) => !item.staffOnly || isStaff).map((item) => { const Icon = item.icon; return <button key={item.label} className={`nav-item ${view === item.label ? 'active' : ''}`} onClick={() => { setView(item.label); setShowMobileNav(false); }}><Icon size={18} /><span>{item.label}</span>{item.label === 'People' && <span className="nav-count">32</span>}</button>; })}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><ShieldCheck size={18} /><div><b>Protected workspace</b><span>Your data is secure</span></div></div><button className="nav-item" onClick={() => void supabase.auth.signOut()}><LogOut size={18} /><span>Sign out</span></button></div>
      </aside>
      {showMobileNav && <button className="sidebar-overlay" onClick={() => setShowMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>Gevora HRMS</span><ArrowRight size={14} /><b>{view}</b></div><div className="topbar-actions"><button className="search-button"><Search size={17} /><span>Search anything</span><kbd><Command size={12} /> K</kbd></button><div className="topbar-divider" /><div className="notification-wrap"><button className="icon-button notification-button" onClick={() => { setShowNotifications((value) => !value); void markNotificationsRead(); }} aria-label="Notifications"><Bell size={19} />{unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}</button>{showNotifications && <NotificationPanel notifications={notifications} />}</div><button className="profile-trigger" onClick={() => setShowProfileMenu((value) => !value)}><div className="avatar small-avatar">{initials(profile?.full_name ?? 'New employee')}</div><span>{profile?.full_name?.split(' ')[0] ?? 'Account'}</span><ChevronDown size={15} /></button>{showProfileMenu && <div className="profile-menu"><button onClick={() => { setView('Settings'); setShowProfileMenu(false); }}><Settings size={15} /> Settings</button><button onClick={() => void supabase.auth.signOut()}><LogOut size={15} /> Sign out</button></div>}</div></header>
        <div className="page-container">{activeView}<Footer /></div>
      </main>
      {showLeaveForm && <LeaveModal onClose={() => setShowLeaveForm(false)} onSubmit={submitLeave} />}
    </div>
  );
}

function AuthScreen({ mode, setMode, onSubmit, busy, error, message }: { mode: 'signin' | 'signup' | 'forgot'; setMode: (mode: 'signin' | 'signup' | 'forgot') => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; error: string; message: string }) {
  const isForgot = mode === 'forgot';
  const [showPassword, setShowPassword] = useState(false);
  return <main className="auth-layout"><section className="auth-visual"><div className="auth-visual-top"><div className="brand-lockup light-brand"><div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div><div><strong>Gevora</strong><span>HRMS</span></div></div><span className="secure-badge"><ShieldCheck size={14} /> Enterprise ready</span></div><div className="auth-hero"><p className="eyebrow">THE PEOPLE OPERATING SYSTEM</p><h1>Make every day at work <em>count.</em></h1><p>One calm, connected workspace for your people, payroll, and progress.</p><div className="auth-stats"><div><b>32</b><span>Team members</span></div><div><b>98%</b><span>On-time payroll</span></div><div><b>4.9</b><span>Team sentiment</span></div></div></div><div className="auth-visual-footer"><span>Trusted by modern teams</span><div className="trusted-logos"><b>northstar</b><b>ARC</b><b>lumin</b></div></div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-auth-brand"><div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div><strong>Gevora <span>HRMS</span></strong></div><div className="auth-heading"><span className="eyebrow">{isForgot ? 'ACCOUNT RECOVERY' : mode === 'signup' ? 'GET STARTED' : 'WELCOME BACK'}</span><h2>{isForgot ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p>{isForgot ? 'Enter your work email and we’ll send a secure reset link.' : mode === 'signup' ? 'Set up your secure people workspace in minutes.' : 'Sign in to your people workspace.'}</p></div><form className="auth-form" onSubmit={onSubmit}>{mode === 'signup' && <label>Full name<input name="fullName" type="text" placeholder="Alex Morgan" required /></label>}<label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>{!isForgot && <label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} placeholder="At least 8 characters" minLength={8} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>}{error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : isForgot ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button></form><div className="auth-switch">{isForgot ? <button onClick={() => setMode('signin')}>Back to sign in</button> : <>{mode === 'signin' ? <><span>New to Gevora?</span><button onClick={() => setMode('signup')}>Create an account</button></> : <><span>Already have an account?</span><button onClick={() => setMode('signin')}>Sign in</button></>}</>}</div>{mode === 'signin' && <button className="forgot-link" onClick={() => setMode('forgot')}>Forgot password?</button>}<small className="auth-legal">By continuing, you agree to Gevora’s Terms and Privacy Policy.</small></div></section></main>;
}

function Overview({ profile, attendance, leaveRequests, onCheckIn, onCheckOut, onApplyLeave, greeting, isStaff }: { profile: Profile | null; attendance: Attendance | null; leaveRequests: LeaveRequest[]; onCheckIn: () => void; onCheckOut: () => void; onApplyLeave: () => void; greeting: string; isStaff: boolean }) {
  const pendingLeave = leaveRequests.filter((request) => request.status === 'pending').length;
  const workedHours = attendance?.check_in && attendance.check_out ? ((new Date(attendance.check_out).getTime() - new Date(attendance.check_in).getTime()) / 3600000).toFixed(1) : '0.0';
  return <><section className="page-heading"><div><p className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>{greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'}<span className="heading-dot">.</span></h1><p className="subheading">Here’s what’s happening across your workspace today.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onApplyLeave}><Plus size={16} /> New request</button><button className="primary-button" onClick={attendance?.check_in ? onCheckOut : onCheckIn}>{attendance?.check_in ? <><Clock3 size={16} /> Check out</> : <><Activity size={16} /> Check in</>}</button></div></section>{isStaff && <div className="notice-banner"><div className="notice-icon"><Users size={18} /></div><div><b>Your team is looking good today</b><span>28 of 32 employees are active. You have 3 items waiting for review.</span></div><button onClick={() => undefined}>Review approvals <ArrowRight size={15} /></button></div>}<section className="metric-grid"><MetricCard label="Today's attendance" value={attendance?.check_in ? 'Present' : 'Not started'} detail={attendance?.check_in ? `Checked in at ${formatTime(attendance.check_in)}` : 'Start your day with a check-in'} icon={Clock3} tone="blue" /><MetricCard label="Working hours" value={`${workedHours}h`} detail={attendance?.check_out ? 'Completed today' : 'In progress'} icon={Activity} tone="gold" /><MetricCard label="Leave balance" value="18.5 days" detail="3.5 days used this year" icon={CalendarDays} tone="green" /><MetricCard label="Pending requests" value={String(pendingLeave)} detail={pendingLeave ? 'Awaiting review' : 'You’re all caught up'} icon={FileText} tone="orange" /></section><div className="dashboard-grid"><section className="panel attendance-panel"><div className="panel-heading"><div><p className="eyebrow">TODAY</p><h2>Attendance</h2></div><button className="more-button"><MoreHorizontal size={19} /></button></div><div className="attendance-visual"><div className="attendance-ring"><div><b>{attendance?.check_in ? 'Active' : 'Ready'}</b><span>{attendance?.check_in ? 'Your day is underway' : 'Check in when you arrive'}</span></div></div><div className="attendance-details"><div><span>Check in</span><b>{formatTime(attendance?.check_in ?? null)}</b></div><div><span>Check out</span><b>{formatTime(attendance?.check_out ?? null)}</b></div><div><span>Shift</span><b>09:00 – 18:00</b></div></div></div><div className="panel-actions"><button className="secondary-button full-button" onClick={attendance?.check_in ? onCheckOut : onCheckIn}>{attendance?.check_in ? 'Check out for today' : 'Check in for today'}<ArrowRight size={16} /></button></div></section><section className="panel leave-panel"><div className="panel-heading"><div><p className="eyebrow">TIME OFF</p><h2>Leave overview</h2></div><button className="text-button" onClick={onApplyLeave}>Apply leave <ArrowRight size={15} /></button></div><div className="leave-balance"><div className="leave-number"><b>18.5</b><span>available days</span></div><div className="leave-bar"><span style={{ width: '24%' }} /></div><div className="leave-legend"><span><i className="dot blue-dot" /> Used <b>3.5</b></span><span><i className="dot pale-dot" /> Remaining <b>18.5</b></span></div></div><div className="mini-list">{leaveRequests.length === 0 ? <EmptyLine text="No leave requests yet" /> : leaveRequests.slice(0, 3).map((request) => <div className="mini-row" key={request.id}><div className="mini-icon calendar-mini"><CalendarDays size={15} /></div><div><b>{request.leave_type}</b><span>{formatDate(request.start_date)} · {request.days} days</span></div><StatusPill status={request.status} /></div>)}</div></section></div><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Recent activity</h2></div><button className="text-button">View all <ArrowRight size={15} /></button></div><div className="activity-list"><ActivityRow icon={Check} title="Workspace ready" detail="Your secure Gevora profile is active" time="Just now" color="green" /><ActivityRow icon={CalendarDays} title="Plan your year" detail="Your leave balance is ready to use" time="Today" color="blue" /><ActivityRow icon={ShieldCheck} title="Security check" detail="Your workspace is protected with Supabase Auth" time="Today" color="gold" /></div></section></>;
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Clock3; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><b className="metric-value">{value}</b><span className="metric-detail">{detail}</span></div>; }
function ActivityRow({ icon: Icon, title, detail, time, color }: { icon: typeof Check; title: string; detail: string; time: string; color: string }) { return <div className="activity-row"><div className={`activity-icon ${color}`}><Icon size={15} /></div><div><b>{title}</b><span>{detail}</span></div><time>{time}</time></div>; }
function EmptyLine({ text }: { text: string }) { return <div className="empty-line"><FileText size={16} /><span>{text}</span></div>; }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{status}</span>; }

function WorkspaceView({ view, profile, attendance, leaveRequests, isStaff, onApplyLeave }: { view: View; profile: Profile | null; attendance: Attendance | null; leaveRequests: LeaveRequest[]; isStaff: boolean; onApplyLeave: () => void }) {
  const titles: Record<View, [string, string]> = { Overview: ['Overview', 'Your people workspace at a glance.'], Attendance: ['Attendance', 'Keep your workday accurate and on track.'], Leave: ['Leave', 'Plan time away and follow requests in one place.'], Payslips: ['Payslips', 'Your monthly payroll documents, securely stored.'], Documents: ['Documents', 'Keep your employee records complete and current.'], People: ['People', 'The team behind Gevora Holdings.'], Reports: ['Reports', 'Clear signals for better people decisions.'], Settings: ['Settings', 'Make Gevora work the way you do.'] };
  const [title, subtitle] = titles[view];
  return <><section className="page-heading"><div><p className="eyebrow">GEVORA HRMS</p><h1>{title}<span className="heading-dot">.</span></h1><p className="subheading">{subtitle}</p></div>{view === 'Leave' && <button className="primary-button" onClick={onApplyLeave}><Plus size={16} /> Apply leave</button>}</section>{view === 'Attendance' && <div className="workspace-cards"><div className="panel large-panel"><div className="panel-heading"><div><p className="eyebrow">THIS MONTH</p><h2>Attendance history</h2></div><button className="secondary-button">Export report</button></div><div className="calendar-strip">{['M','T','W','T','F','S','S'].map((day, index) => <div key={`${day}-${index}`} className={`calendar-day ${index === 2 ? 'today' : ''}`}><span>{day}</span><b>{18 + index}</b><i /></div>)}</div><div className="history-row"><span className="history-status"><i className="dot green-dot" /> Present</span><b>18 days</b><span className="history-status"><i className="dot orange-dot" /> Late</span><b>2 days</b><span className="history-status"><i className="dot pale-dot" /> Leave</span><b>3.5 days</b></div></div><div className="panel side-stat"><p className="eyebrow">TODAY’S STATUS</p><div className="big-stat">{attendance?.check_in ? 'Present' : 'Not started'}</div><span>{attendance?.check_in ? `Checked in at ${formatTime(attendance.check_in)}` : 'Your attendance will appear here after check-in.'}</span><div className="stat-divider" /><span className="muted-label">Current shift</span><b>09:00 – 18:00</b></div></div>}{view === 'Leave' && <div className="workspace-cards"><div className="panel large-panel"><div className="panel-heading"><div><p className="eyebrow">REQUEST HISTORY</p><h2>Your requests</h2></div><StatusPill status="18.5 days available" /></div>{leaveRequests.length === 0 ? <div className="empty-state"><CalendarDays size={24} /><b>No requests yet</b><span>When you apply for leave, it will show up here.</span><button className="secondary-button" onClick={onApplyLeave}>Apply your first request</button></div> : <div className="request-table">{leaveRequests.map((request) => <div className="request-row" key={request.id}><div><b>{request.leave_type}</b><span>{formatDate(request.start_date)} – {formatDate(request.end_date)}</span></div><span>{request.days} days</span><StatusPill status={request.status} /></div>)}</div>}</div><div className="panel side-stat"><p className="eyebrow">LEAVE BALANCE</p><div className="big-stat">18.5 <small>days</small></div><span>Available across your leave policies.</span><div className="balance-list"><span>Annual leave <b>14.5</b></span><span>Sick leave <b>4</b></span></div></div></div>}{view === 'Payslips' && <SimplePanel icon={CreditCard} title="Your payslips are private by design" text="Once payroll is processed, monthly payslips will appear here with secure download access." action="View payroll calendar" />}{view === 'Documents' && <SimplePanel icon={FileText} title="Your document center" text="Upload identity, tax, and employment documents. HR review status will be tracked here." action="Upload a document" />}{view === 'People' && isStaff && <PeoplePanel />}{view === 'Reports' && isStaff && <ReportsPanel />}{view === 'Settings' && <SettingsPanel profile={profile} />}</>;
}
function SimplePanel({ icon: Icon, title, text, action }: { icon: typeof FileText; title: string; text: string; action: string }) { return <div className="panel empty-state full-empty"><div className="empty-icon"><Icon size={24} /></div><h2>{title}</h2><p>{text}</p><button className="primary-button">{action}<ArrowRight size={16} /></button></div>; }
function PeoplePanel() { return <div className="panel large-panel"><div className="panel-heading"><div><p className="eyebrow">DIRECTORY</p><h2>People at Gevora</h2></div><button className="secondary-button"><Plus size={16} /> Add employee</button></div><div className="directory-toolbar"><div className="inline-search"><Search size={16} /><span>Search people</span></div><button className="secondary-button">All departments <ChevronDown size={15} /></button></div><div className="people-list">{['Alex Morgan', 'Maya Chen', 'Jordan Ellis', 'Samira Patel'].map((name, index) => <div className="person-row" key={name}><div className="avatar">{initials(name)}</div><div><b>{name}</b><span>{['Product Design', 'Engineering', 'People Operations', 'Finance'][index]} · {['Lead designer', 'Senior engineer', 'HR partner', 'Payroll specialist'][index]}</span></div><span className="person-status">Active</span><MoreHorizontal size={18} /></div>)}</div></div>; }
function ReportsPanel() { return <div className="report-grid"><div className="panel report-card"><p className="eyebrow">HEADCOUNT</p><b>32</b><span>+8.4% vs last month</span><div className="fake-chart bars"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="panel report-card"><p className="eyebrow">ATTENDANCE RATE</p><b>94.8%</b><span>+2.1% vs last month</span><div className="fake-chart line-chart"><svg viewBox="0 0 300 70" preserveAspectRatio="none"><path d="M0 56 C35 53 42 32 76 40 S124 56 158 28 S206 44 242 18 S275 25 300 8" /></svg></div></div><div className="panel report-card wide-report"><div><p className="eyebrow">TEAM PULSE</p><h2>People analytics</h2><p>Reports become available as your workspace collects more activity.</p></div><div className="pulse-score"><b>4.9</b><span>out of 5</span></div></div></div>; }
function SettingsPanel({ profile }: { profile: Profile | null }) { return <div className="settings-grid"><div className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">YOUR PROFILE</p><h2>Personal details</h2></div><button className="secondary-button">Edit</button></div><div className="profile-detail"><div className="avatar large-avatar">{initials(profile?.full_name ?? 'New employee')}</div><div><b>{profile?.full_name ?? 'New employee'}</b><span>{profile?.designation ?? 'Team member'} · {profile?.department ?? 'People Operations'}</span><span>{profile?.email}</span></div></div></div><div className="panel settings-card"><p className="eyebrow">SECURITY</p><h2>Account protection</h2><div className="security-row"><ShieldCheck size={18} /><div><b>Secure authentication</b><span>Email/password sign-in is active</span></div><span className="secure-status">Protected</span></div><div className="security-row"><LockIcon /><div><b>Two-step verification</b><span>Authenticator app setup is available for your account</span></div><button className="text-button">Set up</button></div></div></div>; }
function LockIcon() { return <ShieldCheck size={18} />; }
function NotificationPanel({ notifications }: { notifications: Notification[] }) { return <div className="notification-panel"><div className="notification-panel-heading"><b>Notifications</b><button><MoreHorizontal size={17} /></button></div>{notifications.length === 0 ? <EmptyLine text="You're all caught up" /> : notifications.slice(0, 4).map((notification) => <div className="notification-item" key={notification.id}><div className="notification-mini"><Bell size={14} /></div><div><b>{notification.title}</b><span>{notification.body}</span></div></div>)}</div>; }
function LeaveModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop"><div className="modal-card"><div className="modal-heading"><div><p className="eyebrow">TIME OFF</p><h2>Apply for leave</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><form onSubmit={onSubmit} className="modal-form"><label>Leave type<select name="leaveType" defaultValue="Annual leave"><option>Annual leave</option><option>Sick leave</option><option>Personal day</option></select></label><div className="form-row"><label>From<input type="date" name="startDate" required /></label><label>To<input type="date" name="endDate" required /></label></div><label>Reason<textarea name="reason" placeholder="Add a note for your manager" required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Submit request <ArrowRight size={16} /></button></div></form></div></div>; }
function Footer() { return <footer className="site-footer"><span>© {new Date().getFullYear()} Gevora HRMS</span><div className="footer-links"><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">Instagram</a><a href="https://linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn">LinkedIn</a><a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X">X</a></div></footer>; }
