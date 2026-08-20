'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight, CalendarDays, Clock3, Activity, FileText,
  MoreHorizontal, Plus, AlertTriangle, Coffee, Check,
} from 'lucide-react';
import type { Profile, Attendance, LeaveRequest } from '@/lib/types';
import { formatTime, formatSeconds, elapsedSeconds, shiftDurationHours, todayISO } from '@/lib/helpers';
import { supabase } from '@/lib/supabase';
import { MetricCard, ActivityRow, StatusPill, EmptyLine, Avatar } from '@/components/shared';
import { LeaveModal } from '@/components/views/leave-modal';

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

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

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
      if (data && data.check_in && !data.check_out) setMissingPunch(true);
      else setMissingPunch(false);
    })();
  }, [profile?.id, tick]);

  const pendingLeave = leaveRequests.filter((r) => r.status === 'pending').length;
  const liveSeconds = attendance?.check_in ? elapsedSeconds(attendance.check_in, attendance.check_out) : 0;
  const shiftHours = shiftInfo ? shiftDurationHours(shiftInfo.start, shiftInfo.end) : 9;
  const progressPct = Math.min(100, (liveSeconds / (shiftHours * 3600)) * 100);
  const ringCircumference = 2 * Math.PI * 45;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const now = new Date();
  const shiftEndToday = shiftInfo ? new Date(`${todayISO()}T${shiftInfo.end}:00`) : null;
  const shiftStartToday = shiftInfo ? new Date(`${todayISO()}T${shiftInfo.start}:00`) : null;
  const remainingMs = shiftEndToday ? shiftEndToday.getTime() - now.getTime() : 0;
  const remainingLabel = remainingMs > 0 ? formatSeconds(Math.floor(remainingMs / 1000)) : 'Shift complete';
  const isLateForShift = shiftStartToday ? now.getTime() > shiftStartToday.getTime() + 15 * 60000 && !attendance?.check_in : false;

  const onBreak = !!(attendance?.break_start && !attendance?.break_end);
  const breakSeconds = onBreak && attendance?.break_start ? elapsedSeconds(attendance.break_start) : 0;

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
              <button className="timer-button" onClick={onStartBreak}><Coffee size={16} /> Start break</button>
              <button className="timer-button danger" onClick={onCheckOut}><Clock3 size={16} /> Check out</button>
            </>
          )}
          {onBreak && (
            <button className="timer-button active" onClick={onEndBreak}><Coffee size={16} /> End break · <span className="timer-mono">{formatSeconds(breakSeconds)}</span></button>
          )}
          {attendance?.check_out && (
            <button className="timer-button done" disabled><Check size={16} /> Day complete</button>
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
        <MetricCard label="Working hours" value={`${(liveSeconds / 3600).toFixed(1)}h`} detail={attendance?.check_out ? 'Completed today' : attendance?.check_in ? 'In progress' : 'Not started'} icon={Activity} tone="gold" />
        <MetricCard label="Leave balance" value="18.5 days" detail="3.5 days used this year" icon={CalendarDays} tone="green" />
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
            <span className="caption">Time remaining in shift</span>
            <b className="big-number" style={{ fontSize: '1.5rem' }}>{remainingLabel}</b>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">TIME OFF</p><h2>Leave overview</h2></div>
            <button className="text-button" onClick={() => setShowLeaveForm(true)}>Apply leave <ArrowRight size={15} /></button>
          </div>
          <div className="leave-balance">
            <div className="leave-number"><b>18.5</b><span>available days</span></div>
            <div className="leave-bar"><span style={{ width: '24%' }} /></div>
            <div className="leave-legend">
              <span><i className="dot blue-dot" /> Used <b>3.5</b></span>
              <span><i className="dot pale-dot" /> Remaining <b>18.5</b></span>
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
    </>
  );
}
