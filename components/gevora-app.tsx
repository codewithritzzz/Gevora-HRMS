'use client';

import { FormEvent, useEffect, useState, useCallback } from 'react';
import {
  ArrowRight, Bell, ChevronDown, Command, LogOut, Menu,
  MoreHorizontal, Search, Settings as SettingsIcon, ShieldCheck,
  X, LayoutDashboard, Clock3, CalendarDays, CreditCard, FileText,
  Activity, Users, Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { Profile, Attendance, LeaveRequest, Notification, EmployeePresence } from '@/lib/types';
import { initials, greeting } from '@/lib/helpers';
import { Footer, Avatar } from '@/components/shared';
import { AuthScreen } from '@/components/views/auth';
import { OverviewView } from '@/components/views/overview';
import { AttendanceView } from '@/components/views/attendance';
import { LeaveView } from '@/components/views/leave';
import { DocumentsView } from '@/components/views/documents';
import { PeopleView } from '@/components/views/people';
import { ReportsView } from '@/components/views/reports';
import { SettingsView } from '@/components/views/settings';

type View = 'Overview' | 'Attendance' | 'Leave' | 'Documents' | 'People' | 'Reports' | 'Settings';

const navItems: Array<{ label: View; icon: typeof LayoutDashboard; staffOnly?: boolean }> = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Attendance', icon: Clock3 },
  { label: 'Leave', icon: CalendarDays },
  { label: 'Documents', icon: FileText },
  { label: 'People', icon: Users, staffOnly: true },
  { label: 'Reports', icon: Activity, staffOnly: true },
  { label: 'Settings', icon: SettingsIcon },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EmployeePresence[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const isStaff = ['MANAGER', 'HR', 'PAYROLL', 'ADMIN', 'SUPER_ADMIN'].includes(profile?.role ?? '');
  const unreadCount = notifications.filter((n) => !n.read_at).length;

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

  const loadWorkspace = useCallback(async (userId: string) => {
    const [profileRes, attendanceRes, leaveRes, notifRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('attendance').select('*').eq('user_id', userId).eq('work_date', new Date().toISOString().slice(0, 10)).maybeSingle(),
      supabase.from('leave_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
      setTheme((profileRes.data as Profile).theme ?? 'system');
    }
    setAttendance((attendanceRes.data as Attendance | null) ?? null);
    setLeaveRequests((leaveRes.data as LeaveRequest[] | null) ?? []);
    setNotifications((notifRes.data as Notification[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    void loadWorkspace(session.user.id);
  }, [session, loadWorkspace]);

  useEffect(() => {
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!searchQuery.trim() || !session) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('employee_presence')
        .select('*')
        .ilike('full_name', `%${searchQuery.trim()}%`)
        .limit(8);
      setSearchResults((data as EmployeePresence[] | null) ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, session]);

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
    if (error) { toast({ title: 'Check-in failed', description: error.message, variant: 'destructive' }); return; }
    if (data) { setAttendance(data as Attendance); toast({ title: 'Checked in', description: 'Have a great day!' }); }
  };

  const checkOut = async () => {
    if (!attendance?.id || attendance.check_out) return;
    const { data, error } = await supabase.from('attendance').update({ check_out: new Date().toISOString() }).eq('id', attendance.id).select().maybeSingle();
    if (error) { toast({ title: 'Check-out failed', description: error.message, variant: 'destructive' }); return; }
    if (data) { setAttendance(data as Attendance); toast({ title: 'Checked out', description: 'See you tomorrow!' }); }
  };

  const startBreak = async () => {
    if (!attendance?.id || attendance.break_start) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('attendance').update({ break_start: now }).eq('id', attendance.id).select().maybeSingle();
    if (error) { toast({ title: 'Break failed', description: error.message, variant: 'destructive' }); return; }
    if (data) { setAttendance(data as Attendance); toast({ title: 'Break started', description: 'Enjoy your break.' }); }
  };

  const endBreak = async () => {
    if (!attendance?.id || !attendance.break_start || attendance.break_end) return;
    const now = new Date().toISOString();
    const breakMinutes = (new Date(now).getTime() - new Date(attendance.break_start).getTime()) / 60000;
    const newTotal = (attendance.total_break_minutes ?? 0) + breakMinutes;
    const { data, error } = await supabase.from('attendance').update({ break_end: now, total_break_minutes: newTotal }).eq('id', attendance.id).select().maybeSingle();
    if (error) { toast({ title: 'Break end failed', description: error.message, variant: 'destructive' }); return; }
    if (data) { setAttendance(data as Attendance); toast({ title: 'Break ended', description: `Break: ${Math.round(breakMinutes)} min` }); }
  };

  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate'));
    const endDate = String(form.get('endDate'));
    const reason = String(form.get('reason'));
    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const { data, error } = await supabase.from('leave_requests').insert({ leave_type: String(form.get('leaveType')), start_date: startDate, end_date: endDate, days, reason, status: 'pending' }).select().maybeSingle();
    if (error) { toast({ title: 'Leave request failed', description: error.message, variant: 'destructive' }); return; }
    if (data) {
      setLeaveRequests((current) => [data as LeaveRequest, ...current]);
      setShowLeaveForm(false);
      toast({ title: 'Leave requested', description: 'Your manager will review it shortly.' });
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

  const viewProps = { profile, attendance, leaveRequests, isStaff, onApplyLeave: () => setShowLeaveForm(true) };

  const renderView = () => {
    switch (view) {
      case 'Overview': return <OverviewView {...viewProps} onCheckIn={checkIn} onCheckOut={checkOut} onStartBreak={startBreak} onEndBreak={endBreak} greeting={greeting()} />;
      case 'Attendance': return <AttendanceView profile={profile} isStaff={isStaff} />;
      case 'Leave': return <LeaveView {...viewProps} />;
      case 'Documents': return <DocumentsView profile={profile} isStaff={isStaff} />;
      case 'People': return isStaff ? <PeopleView isStaff={isStaff} /> : <ReportsView />;
      case 'Reports': return isStaff ? <ReportsView /> : null;
      case 'Settings': return <SettingsView profile={profile} onSaveTheme={saveTheme} onProfileUpdate={() => session.user && loadWorkspace(session.user.id)} />;
      default: return null;
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${showMobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div>
          <div><strong>Gevora</strong><span>HRMS</span></div>
          <button className="icon-button mobile-close" onClick={() => setShowMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-pill"><div className="workspace-avatar">G</div><div><b>Gevora Holdings</b><small>People workspace</small></div><ChevronDown size={15} /></div>
        <nav className="main-nav" aria-label="Main navigation">
          <small className="nav-label">Workspace</small>
          {navItems.filter((item) => !item.staffOnly || isStaff).map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className={`nav-item ${view === item.label ? 'active' : ''}`} onClick={() => { setView(item.label); setShowMobileNav(false); }}>
                <Icon size={18} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><ShieldCheck size={18} /><div><b>Protected workspace</b><span>Your data is secure</span></div></div>
          <button className="nav-item" onClick={() => void supabase.auth.signOut()}><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </aside>
      {showMobileNav && <button className="sidebar-overlay" onClick={() => setShowMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Gevora HRMS</span><ArrowRight size={14} /><b>{view}</b></div>
          <div className="topbar-actions">
            <div className="search-wrap">
              <div className="search-button" style={{ display: 'none' }} />
              <div className="search-input">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search people…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                />
              </div>
              {showSearch && searchResults.length > 0 && (
                <div className="search-dropdown">
                  {searchResults.map((person) => (
                    <div className="search-result" key={person.id}>
                      <Avatar name={person.full_name} src={person.avatar_url} size="small" />
                      <div><b>{person.full_name}</b><span>{person.designation} · {person.department}</span></div>
                      <span className={`sr-status ${person.today_status}`}>{person.today_status.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="notification-wrap">
              <button className="icon-button" onClick={() => { setShowNotifications((v) => !v); void markNotificationsRead(); }} aria-label="Notifications">
                <Bell size={19} />{unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-panel-heading"><b>Notifications</b><MoreHorizontal size={17} /></div>
                  {notifications.length === 0 ? <div className="empty-line"><FileText size={16} /><span>You're all caught up</span></div> : notifications.slice(0, 4).map((n) => (
                    <div className="notification-item" key={n.id}>
                      <div className="notification-mini"><Bell size={14} /></div>
                      <div><b>{n.title}</b><span>{n.body}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="profile-trigger" onClick={() => setShowProfileMenu((v) => !v)}>
              <Avatar name={profile?.full_name ?? 'New employee'} src={profile?.avatar_url} size="small" />
              <span>{profile?.full_name?.split(' ')[0] ?? 'Account'}</span>
              <ChevronDown size={15} />
            </button>
            {showProfileMenu && (
              <div className="profile-menu">
                <button onClick={() => { setView('Settings'); setShowProfileMenu(false); }}><SettingsIcon size={15} /> Settings</button>
                <button onClick={() => void supabase.auth.signOut()}><LogOut size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <div className="page-container">
          {renderView()}
          <Footer />
        </div>
      </main>
    </div>
  );
}
