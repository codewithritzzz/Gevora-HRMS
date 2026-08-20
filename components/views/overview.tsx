'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight, CalendarDays, Clock3, Activity, FileText,
  MoreHorizontal, Plus, AlertTriangle, Coffee, Check,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import type { Profile, Attendance, LeaveRequest, LeaveBalance, Holiday } from '@/lib/types';
import { formatTime, formatSeconds, elapsedSeconds, shiftDurationHours, todayISO, isToday, isWeekend, monthName, addMonths, formatDate } from '@/lib/helpers';
import { supabase } from '@/lib/supabase';
import { MetricCard, ActivityRow, StatusPill, EmptyLine } from '@/components/shared';
import { LeaveModal } from '@/components/views/leave-modal';

const HUMOR_MESSAGES = [
  'Circling back to circling back...',
  'This meeting could have been a Slack message.',
  'Synergizing your synergy.',
  "Currently 'aligning stakeholders' (napping).",
  'Pivoting the pivot.',
  'Taking this offline... forever.',
  'Let\'s double-click on that.',
  'Boiling the ocean, one kettle at a time.',
  'Moving the needle. Which needle? Unclear.',
  'We\'re not a family, we\'re a synergistic value ecosystem.',
];

export function OverviewView({ profile, attendance, leaveRequests, onCheckIn, onCheckOut, onStartBreak, onEndBreak, greeting, isStaff }: {
  profile: Profile | null;
  attendance: Attendance | null;
  leaveRequests: LeaveRequest[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  greeting: string;
  isStaff: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [shiftInfo, setShiftInfo] = useState<{ start: string; end: string } | null>(null);
  const [missingPunch, setMissingPunch] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [humorIndex, setHumorIndex] = useState(0);
  const [humorFade, setHumorFade] = useState(true);

  // Month calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const [monthAttendance, setMonthAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [approvedLeaveDates, setApprovedLeaveDates] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<{ date: Date; attendance: Attendance | null } | null>(null);

  // Live ticking timer
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-mark present at 9 hours
  useEffect(() => {
    if (!profile?.id || !attendance?.check_in || attendance?.check_out) return;
    const workedSeconds = elapsedSeconds(attendance.check_in, attendance.check_out) - (attendance.total_break_minutes ?? 0) * 60;
    if (workedSeconds >= 9 * 3600) {
      void supabase.rpc('auto_mark_present', { p_user_id: profile.id });
    }
  }, [tick, profile?.id, attendance]);

  // Rotating humor messages
  useEffect(() => {
    const interval = setInterval(() => {
      setHumorFade(false);
      setTimeout(() => {
        setHumorIndex((i) => Math.floor(Math.random() * HUMOR_MESSAGES.length));
        setHumorFade(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Load shift info
  useEffect(() => {
    void (async () => {
      if (!profile?.shift_id) {
        setShiftInfo({ start: '09:00', end: '18:00' });
        return;
      }
      const { data } = await supabase.from('shifts').select('start_time, end_time').eq('id', profile.shift_id).maybeSingle();
      if (data) setShiftInfo({ start: data.start_time, end: data.end_time });
      else setShiftInfo({ start: '09:00', end: '18:00' });
    })();
  }, [profile?.shift_id]);

  // Load leave balance
  useEffect(() => {
    void (async () => {
      if (!profile?.id) return;
      const { data } = await supabase
        .from('leave_balance_view')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (data) setLeaveBalance(data as LeaveBalance);
      else setLeaveBalance({ user_id: profile.id, available: 0, used_days: 0, accrued: 0 });
    })();
  }, [profile?.id, leaveRequests]);

  // Check missing punch from yesterday
  useEffect(() => {
    void (async () => {
      if (!profile) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yDate = yesterday.toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendance')
        .select('check_in, check_out')
        .eq('user_id', profile.id)
        .eq('work_date', yDate)
        .maybeSingle();
      setMissingPunch(!!(data && data.check_in && !data.check_out));
    })();
  }, [profile?.id]);

  // Load calendar data
  useEffect(() => {
    void loadCalendarData();
  }, [profile?.id, calMonth]);

  const loadCalendarData = async () => {
    if (!profile?.id) return;
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
    const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const [attRes, holRes, leaveRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', profile.id).gte('work_date', startDate).lte('work_date', endDate),
      supabase.from('holidays').select('*').gte('holiday_date', startDate).lte('holiday_date', endDate),
      supabase.from('leave_requests').select('start_date, end_date').eq('user_id', profile.id).eq('status', 'approved'),
    ]);

    setMonthAttendance((attRes.data as Attendance[] | null) ?? []);
    setHolidays((holRes.data as Holiday[] | null) ?? []);

    const leaveDates = new Set<string>();
    (leaveRes.data as Array<{ start_date: string; end_date: string }> | null)?.forEach((lr) => {
      const start = new Date(lr.start_date + 'T12:00:00');
      const end = new Date(lr.end_date + 'T12:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDates.add(d.toISOString().slice(0, 10));
      }
    });
    setApprovedLeaveDates(leaveDates);
  };

  // Derive live values from the stored timestamp (single source of truth)
  const liveSeconds = attendance?.check_in ? elapsedSeconds(attendance.check_in, attendance.check_out) : 0;
  const shiftHours = shiftInfo ? shiftDurationHours(shiftInfo.start, shiftInfo.end) : 9;
  const progressPct = Math.min(100, (liveSeconds / (shiftHours * 3600)) * 100);
  const ringCircumference = 2 * Math.PI * 45;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  // Shift countdown: only counts when checked in and not checked out
  const now = new Date();
  const shiftEndToday = shiftInfo ? new Date(`${todayISO()}T${shiftInfo.end}:00`) : null;
  const shiftStartToday = shiftInfo ? new Date(`${todayISO()}T${shiftInfo.start}:00`) : null;
  const isCountingDown = !!(attendance?.check_in && !attendance?.check_out);
  const isFrozen = !!(attendance?.check_out);

  let remainingLabel: string;
  let remainingMs: number;

  if (isFrozen && attendance?.check_out && shiftEndToday) {
    // Frozen at check-out moment
    remainingMs = shiftEndToday.getTime() - new Date(attendance.check_out).getTime();
    remainingLabel = remainingMs > 0 ? formatSeconds(Math.floor(remainingMs / 1000)) : 'Shift complete';
  } else if (isCountingDown && shiftEndToday) {
    remainingMs = shiftEndToday.getTime() - now.getTime();
    remainingLabel = remainingMs > 0 ? formatSeconds(Math.floor(remainingMs / 1000)) : 'Shift complete';
  } else {
    // Idle: show full shift length, not counting
    remainingMs = shiftHours * 3600 * 1000;
    remainingLabel = formatSeconds(Math.round(remainingMs / 1000));
  }

  const isLateForShift = shiftStartToday ? now.getTime() > shiftStartToday.getTime() + 15 * 60000 && !attendance?.check_in : false;
  const onBreak = !!(attendance?.break_start && !attendance?.break_end);
  const breakSeconds = onBreak && attendance?.break_start ? elapsedSeconds(attendance.break_start) : 0;

  const pendingLeave = leaveRequests.filter((r) => r.status === 'pending').length;
  const availableDays = leaveBalance?.available?.toFixed(1) ?? '0.0';
  const usedDays = leaveBalance?.used_days?.toFixed(1) ?? '0.0';

  // Calendar cell computation
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const attByDate = new Map<string, Attendance>();
  monthAttendance.forEach((a) => attByDate.set(a.work_date, a));
  const holidayDates = new Map<string, string>();
  holidays.forEach((h) => holidayDates.set(h.holiday_date, h.name));

  const cellStatus = (day: number): string => {
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    if (approvedLeaveDates.has(iso)) return 'paid_leave';
    if (holidayDates.has(iso)) return 'holiday';
    if (isWeekend(date)) return 'weekoff';
    const att = attByDate.get(iso);
    if (att) return att.status;
    if (date < new Date() && !isToday(date)) return 'absent';
    return '';
  };

  const cells: Array<{ day: number | null; status: string; date?: Date }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, status: 'empty' });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, status: cellStatus(d), date });
  }

  const handleDayClick = (day: number | null, status: string) => {
    if (!day) return;
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    const att = attByDate.get(iso) ?? null;
    setSelectedDay({ date, attendance: att });
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1>{greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'}<span className="heading-dot">.</span></h1>
          <p className="subheading">Here's what's happening across your workspace today.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setShowLeaveForm(true)}><Plus size={16} /> New request</button>
          {!attendance?.check_in && !onBreak && (
            <button className="timer-button active" onClick={onCheckIn}><Activity size={16} /> Check in</button>
          )}
          {attendance?.check_in && !attendance?.check_out && !onBreak && (
            <>
              <button className="timer-button active" disabled>
                <Clock3 size={16} />
                <span className="timer-mono">{formatSeconds(liveSeconds)}</span>
              </button>
              <button className="timer-button" onClick={onStartBreak}><Coffee size={16} /> Break</button>
              <button className="timer-button danger" onClick={onCheckOut}><Check size={16} /> Check out</button>
            </>
          )}
          {onBreak && (
            <>
              <button className="timer-button active" disabled>
                <Coffee size={16} />
                <span className="timer-mono">{formatSeconds(breakSeconds)}</span>
              </button>
              <button className="timer-button active" onClick={onEndBreak}><Coffee size={16} /> End break</button>
            </>
          )}
          {attendance?.check_out && (
            <button className="timer-button done" disabled>
              <Check size={16} /> {formatSeconds(liveSeconds)}
            </button>
          )}
        </div>
      </section>

      {missingPunch && (
        <div className="missing-banner">
          <div className="missing-icon"><AlertTriangle size={20} /></div>
          <div><b>Missing check-out from yesterday</b><span>Submit a regularization request to correct your attendance.</span></div>
          <button className="secondary-button" onClick={() => undefined}>Regularize <ArrowRight size={15} /></button>
        </div>
      )}

      {isStaff && (
        <div className="notice-banner">
          <div className="notice-icon"><Activity size={18} /></div>
          <div><b>Your team is looking good today</b><span>28 of 32 employees are active. You have 3 items waiting for review.</span></div>
        </div>
      )}

      <section className="metric-grid">
        <MetricCard label="Today's attendance" value={attendance?.check_in ? 'Present' : isLateForShift ? 'Late' : 'Not started'} detail={attendance?.check_in ? `Checked in at ${formatTime(attendance.check_in)}` : 'Start your day with a check-in'} icon={Clock3} tone="blue" />
        <div className="metric-card">
          <div className="metric-icon gold"><Activity size={18} /></div>
          <span className="metric-label">Office vibe</span>
          <b className="metric-value humor-message" style={{ fontSize: '0.8125rem', lineHeight: 1.3, minHeight: '2.6em', display: 'flex', alignItems: 'center', opacity: humorFade ? 1 : 0, transition: 'opacity 0.3s ease' }}>
            {HUMOR_MESSAGES[humorIndex]}
          </b>
          <span className="metric-detail">Auto-generated motivation</span>
        </div>
        <MetricCard label="Leave balance" value={`${availableDays} days`} detail={`${usedDays} days used`} icon={CalendarDays} tone="green" />
        <MetricCard label="Pending requests" value={String(pendingLeave)} detail={pendingLeave ? 'Awaiting review' : "You're all caught up"} icon={FileText} tone="orange" />
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">LIVE TIMER</p><h2>Today's attendance</h2></div>
            <button className="more-button"><MoreHorizontal size={19} /></button>
          </div>
          <div className="attendance-visual">
            <div className="attendance-ring" style={{ background: 'none', position: 'relative' }}>
              <svg width="120" height="120" className="progress-ring-svg" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="45" fill="none" strokeWidth="10" className="progress-ring-track" />
                <circle
                  cx="60" cy="60" r="45" fill="none" strokeWidth="10"
                  className={`progress-ring-fill ${progressPct >= 100 ? 'complete' : ''}`}
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <b className="timer-mono" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>
                  {attendance?.check_in ? formatSeconds(liveSeconds) : '00:00:00'}
                </b>
                <span style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.1875rem' }}>
                  {progressPct >= 100 ? 'Complete' : `${Math.round(progressPct)}% of shift`}
                </span>
              </div>
            </div>
            <div className="attendance-details">
              <div><span>Check in</span><b>{formatTime(attendance?.check_in ?? null)}</b></div>
              <div><span>Check out</span><b>{formatTime(attendance?.check_out ?? null)}</b></div>
              <div><span>Shift</span><b>{shiftInfo ? `${shiftInfo.start} – ${shiftInfo.end}` : '09:00 – 18:00'}</b></div>
              {onBreak && <div><span>Break</span><b className="timer-mono">{formatSeconds(breakSeconds)}</b></div>}
              {attendance && attendance.total_break_minutes > 0 && !onBreak && (
                <div><span>Total break</span><b>{Math.round(attendance.total_break_minutes)} min</b></div>
              )}
            </div>
          </div>
          <div className="shift-countdown" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '12px', background: 'hsl(var(--secondary))' }}>
            <span className="caption">
              {isFrozen ? 'Time remaining at check-out' : isCountingDown ? 'Time remaining in shift' : 'Shift duration (idle — check in to start)'}
            </span>
            <b className="big-number" style={{ fontSize: '1.5rem' }}>{remainingLabel}</b>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">TIME OFF</p><h2>Leave overview</h2></div>
            <button className="text-button" onClick={() => setShowLeaveForm(true)}>Apply leave <ArrowRight size={15} /></button>
          </div>
          <div className="leave-balance">
            <div className="leave-number"><b>{availableDays}</b><span>available days</span></div>
            <div className="leave-bar"><span style={{ width: `${Math.min(100, (parseFloat(usedDays) / Math.max(1, parseFloat(usedDays) + parseFloat(availableDays))) * 100)}%` }} /></div>
            <div className="leave-legend">
              <span><i className="dot blue-dot" /> Used <b>{usedDays}</b></span>
              <span><i className="dot pale-dot" /> Remaining <b>{availableDays}</b></span>
            </div>
          </div>
          <div className="mini-list">
            {leaveRequests.length === 0 ? <EmptyLine text="No leave requests yet" /> : leaveRequests.slice(0, 3).map((r) => (
              <div className="mini-row" key={r.id}>
                <div className="mini-icon calendar-mini"><CalendarDays size={15} /></div>
                <div><b>{r.leave_type}</b><span>{r.start_date} · {r.days} days</span></div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Big interactive calendar on dashboard */}
      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-heading">
          <div><p className="eyebrow">THIS MONTH</p><h2>Attendance calendar</h2></div>
        </div>
        <div className="cal-nav">
          <button onClick={() => setCalMonth(addMonths(calMonth, -1))}><ChevronLeft size={16} /></button>
          <b>{monthName(calMonth)}</b>
          <button onClick={() => setCalMonth(addMonths(calMonth, 1))}><ChevronRight size={16} /></button>
        </div>
        <div className="cal-grid cal-grid-large">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((wd) => (
            <div className="cal-weekday" key={wd}>{wd}</div>
          ))}
          {cells.map((cell, i) => (
            <button
              key={i}
              className={`cal-cell cal-cell-large ${cell.status === 'empty' ? 'empty' : cell.status} ${cell.day && isToday(new Date(year, month, cell.day)) ? 'today' : ''}`}
              onClick={() => handleDayClick(cell.day, cell.status)}
              disabled={!cell.day}
            >
              {cell.day && <span className="cal-date">{cell.day}</span>}
              {cell.day && cell.status !== 'empty' && cell.status !== 'weekoff' && (
                <span className="cal-status">{cell.status === 'paid_leave' ? 'Paid leave' : cell.status.replace(/_/g, ' ')}</span>
              )}
              {cell.day && cell.status === 'holiday' && holidayDates.has(new Date(year, month, cell.day).toISOString().slice(0, 10)) && (
                <span className="cal-status">{holidayDates.get(new Date(year, month, cell.day).toISOString().slice(0, 10))}</span>
              )}
            </button>
          ))}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: 'hsl(142 71% 45% / 0.3)' }} /> Present</span>
          <span><i style={{ background: 'hsl(0 84% 60% / 0.3)' }} /> Absent</span>
          <span><i style={{ background: 'hsl(271 76% 53% / 0.2)' }} /> Paid leave</span>
          <span><i style={{ background: 'hsl(38 92% 50% / 0.2)' }} /> Holiday</span>
          <span><i style={{ background: 'hsl(var(--secondary))' }} /> Weekend</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Recent activity</h2></div>
        </div>
        <div className="activity-list">
          <ActivityRow icon={Check} title="Workspace ready" detail="Your secure Gevora profile is active" time="Just now" color="green" />
          <ActivityRow icon={CalendarDays} title="Plan your year" detail="Your leave balance is ready to use" time="Today" color="blue" />
          <ActivityRow icon={Clock3} title="Attendance tracking" detail="Check in and out to track your workday" time="Today" color="gold" />
        </div>
      </section>

      {showLeaveForm && <LeaveModal onClose={() => setShowLeaveForm(false)} />}
      {selectedDay && <DayDetailModal date={selectedDay.date} attendance={selectedDay.attendance} onClose={() => setSelectedDay(null)} />}
    </>
  );
}

function DayDetailModal({ date, attendance, onClose }: { date: Date; attendance: Attendance | null; onClose: () => void }) {
  const iso = date.toISOString().slice(0, 10);
  const isWeekendDay = isWeekend(date);
  const isFuture = date > new Date() && !isToday(date);

  let workedHours = '—';
  if (attendance?.check_in) {
    const seconds = elapsedSeconds(attendance.check_in, attendance.check_out);
    workedHours = `${(seconds / 3600).toFixed(1)}h`;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{date.toLocaleDateString([], { weekday: 'long' })}</p>
            <h2>{formatDate(iso)}</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {attendance ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted-label">Status</span>
              <StatusPill status={attendance.status === 'paid_leave' ? 'paid_leave' : attendance.status} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted-label">Check in</span>
              <b style={{ fontSize: '0.875rem' }}>{formatTime(attendance.check_in)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted-label">Check out</span>
              <b style={{ fontSize: '0.875rem' }}>{formatTime(attendance.check_out)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted-label">Hours worked</span>
              <b style={{ fontSize: '0.875rem' }}>{workedHours}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted-label">Break duration</span>
              <b style={{ fontSize: '0.875rem' }}>{attendance.total_break_minutes ? `${Math.round(attendance.total_break_minutes)} min` : '—'}</b>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '1.5rem 0' }}>
            {isFuture ? (
              <>
                <CalendarDays size={24} />
                <b>Future date</b>
                <span>No attendance record for this date yet.</span>
              </>
            ) : isWeekendDay ? (
              <>
                <CalendarDays size={24} />
                <b>Weekend</b>
                <span>This is a non-working day — no attendance expected.</span>
              </>
            ) : (
              <>
                <Clock3 size={24} />
                <b>No record</b>
                <span>No attendance was logged for this date.</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
