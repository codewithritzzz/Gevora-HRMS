'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  Plus, Clock3, CalendarDays, Coffee, AlertTriangle,
  Check, X, ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { Profile, Attendance, RegularizationRequest, OvertimeRequest, Shift, Holiday } from '@/lib/types';
import { formatTime, formatDate, todayISO, isToday, isWeekend, monthName, addMonths, isSameDay } from '@/lib/helpers';
import { StatusPill, EmptyLine, PageHeading, PanelHeading } from '@/components/shared';

type Tab = 'list' | 'regularization' | 'overtime' | 'shifts';

export function AttendanceView({ profile, isStaff }: { profile: Profile | null; isStaff: boolean }) {
  const [tab, setTab] = useState<Tab>('list');
  const [attendanceList, setAttendanceList] = useState<Attendance[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const [showRegForm, setShowRegForm] = useState(false);
  const [showOtForm, setShowOtForm] = useState(false);

  useEffect(() => {
    void loadAll();
  }, [profile?.id]);

  const loadAll = async () => {
    if (!profile?.id) return;
    const [attRes, regRes, otRes, shiftRes, holRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', profile.id).order('work_date', { ascending: false }).limit(30),
      supabase.from('regularization_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('overtime_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('shifts').select('*'),
      supabase.from('holidays').select('*').order('holiday_date', { ascending: true }),
    ]);
    setAttendanceList((attRes.data as Attendance[] | null) ?? []);
    setRegularizations((regRes.data as RegularizationRequest[] | null) ?? []);
    setOvertimes((otRes.data as OvertimeRequest[] | null) ?? []);
    setShifts((shiftRes.data as Shift[] | null) ?? []);
    setHolidays((holRes.data as Holiday[] | null) ?? []);
  };

  const submitReg = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { data, error } = await supabase.from('regularization_requests').insert({
      work_date: String(form.get('workDate')),
      reason: String(form.get('reason')),
      requested_check_in: form.get('checkIn') ? new Date(`${form.get('workDate')}T${form.get('checkIn')}:00`).toISOString() : null,
      requested_check_out: form.get('checkOut') ? new Date(`${form.get('workDate')}T${form.get('checkOut')}:00`).toISOString() : null,
    }).select().maybeSingle();
    if (error) { toast({ title: 'Request failed', description: error.message, variant: 'destructive' }); return; }
    if (data) {
      setRegularizations((current) => [data as RegularizationRequest, ...current]);
      setShowRegForm(false);
      toast({ title: 'Regularization submitted', description: 'Your manager will review it.' });
    }
  };

  const submitOt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hours = parseFloat(String(form.get('hours')));
    if (hours <= 0 || hours > 6) {
      toast({ title: 'Invalid hours', description: 'Overtime must be between 0 and 6 hours.', variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase.from('overtime_requests').insert({
      work_date: String(form.get('workDate')),
      hours_requested: hours,
      reason: String(form.get('reason')),
    }).select().maybeSingle();
    if (error) { toast({ title: 'Request failed', description: error.message, variant: 'destructive' }); return; }
    if (data) {
      setOvertimes((current) => [data as OvertimeRequest, ...current]);
      setShowOtForm(false);
      toast({ title: 'Overtime submitted', description: 'Your manager will review it.' });
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Clock3 }> = [
    { id: 'list', label: 'History & Calendar', icon: CalendarDays },
    { id: 'regularization', label: 'Regularization', icon: AlertTriangle },
    { id: 'overtime', label: 'Overtime', icon: Clock3 },
    { id: 'shifts', label: 'Shifts & Holidays', icon: Coffee },
  ];

  return (
    <>
      <PageHeading eyebrow="GEVORA HRMS" title="Attendance" subtitle="Keep your workday accurate and on track." />
      <div className="tabs-bar">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`tab-button ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'list' && (
        <AttendanceList attendanceList={attendanceList} holidays={holidays} calMonth={calMonth} setCalMonth={setCalMonth} />
      )}

      {tab === 'regularization' && (
        <div className="panel large-panel">
          <PanelHeading
            eyebrow="CORRECTIONS"
            title="Regularization requests"
            action={<button className="primary-button" onClick={() => setShowRegForm(true)}><Plus size={16} /> New request</button>}
          />
          {regularizations.length === 0 ? (
            <div className="empty-state"><AlertTriangle size={24} /><b>No regularization requests</b><span>Missing or incorrect punches? Request a correction here.</span></div>
          ) : (
            <div className="request-table">
              {regularizations.map((r) => (
                <div className="request-row" key={r.id}>
                  <div><b>{r.reason}</b><span>{formatDate(r.work_date)}{r.requested_check_in ? ` · In: ${formatTime(r.requested_check_in)}` : ''}{r.requested_check_out ? ` · Out: ${formatTime(r.requested_check_out)}` : ''}</span></div>
                  <StatusPill status={r.status} />
                </div>
              ))}
            </div>
          )}
          {showRegForm && <RegModal onClose={() => setShowRegForm(false)} onSubmit={submitReg} />}
        </div>
      )}

      {tab === 'overtime' && (
        <div className="panel large-panel">
          <PanelHeading
            eyebrow="EXTRA HOURS"
            title="Overtime requests"
            action={<button className="primary-button" onClick={() => setShowOtForm(true)}><Plus size={16} /> New request</button>}
          />
          {overtimes.length === 0 ? (
            <div className="empty-state"><Clock3 size={24} /><b>No overtime requests</b><span>Request overtime for hours worked beyond your shift (max 6 hours).</span></div>
          ) : (
            <div className="request-table">
              {overtimes.map((o) => (
                <div className="request-row" key={o.id}>
                  <div><b>{o.hours_requested} hours overtime</b><span>{formatDate(o.work_date)} · {o.reason}</span></div>
                  <StatusPill status={o.status} />
                </div>
              ))}
            </div>
          )}
          {showOtForm && <OtModal onClose={() => setShowOtForm(false)} onSubmit={submitOt} />}
        </div>
      )}

      {tab === 'shifts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="panel">
            <PanelHeading eyebrow="WORK SCHEDULE" title="Available shifts" />
            {shifts.length === 0 ? <EmptyLine text="No shifts defined yet" /> : (
              <div className="mini-list">
                {shifts.map((s) => (
                  <div className="mini-row" key={s.id}>
                    <div className="mini-icon calendar-mini"><Clock3 size={15} /></div>
                    <div><b>{s.name}</b><span>{s.start_time} – {s.end_time}</span></div>
                    {profile?.shift_id === s.id && <StatusPill status="active" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel">
            <PanelHeading eyebrow="COMPANY" title="Holidays" />
            {holidays.length === 0 ? <EmptyLine text="No holidays scheduled" /> : (
              <div className="mini-list">
                {holidays.map((h) => (
                  <div className="mini-row" key={h.id}>
                    <div className="mini-icon calendar-mini"><CalendarDays size={15} /></div>
                    <div><b>{h.name}</b><span>{formatDate(h.holiday_date)}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AttendanceList({ attendanceList, holidays, calMonth, setCalMonth }: {
  attendanceList: Attendance[];
  holidays: Holiday[];
  calMonth: Date;
  setCalMonth: (d: Date) => void;
}) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const attByDate = new Map<string, Attendance>();
  attendanceList.forEach((a) => attByDate.set(a.work_date, a));
  const holidayDates = new Set(holidays.map((h) => h.holiday_date));

  const cellStatus = (day: number): string => {
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    if (holidayDates.has(iso)) return 'holiday';
    if (isWeekend(date)) return 'weekoff';
    const att = attByDate.get(iso);
    if (att) return att.status;
    if (date < new Date() && !isToday(date)) return 'absent';
    return '';
  };

  const cells: Array<{ day: number | null; status: string }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, status: 'empty' });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, status: cellStatus(d) });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <div className="view-toggle">
          <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>Calendar</button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div className="panel">
          <div className="cal-nav">
            <button onClick={() => setCalMonth(addMonths(calMonth, -1))}><ChevronLeft size={16} /></button>
            <b>{monthName(calMonth)}</b>
            <button onClick={() => setCalMonth(addMonths(calMonth, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="cal-grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((wd) => (
              <div className="cal-weekday" key={wd}>{wd}</div>
            ))}
            {cells.map((cell, i) => (
              <div key={i} className={`cal-cell ${cell.status === 'empty' ? 'empty' : cell.status} ${cell.day && isToday(new Date(year, month, cell.day)) ? 'today' : ''}`}>
                {cell.day && <span className="cal-date">{cell.day}</span>}
                {cell.day && cell.status !== 'empty' && cell.status !== 'weekoff' && (
                  <span className="cal-status">{cell.status.replace(/_/g, ' ')}</span>
                )}
              </div>
            ))}
          </div>
          <div className="cal-legend">
            <span><i style={{ background: 'hsl(142 71% 45% / 0.3)' }} /> Present</span>
            <span><i style={{ background: 'hsl(0 84% 60% / 0.3)' }} /> Absent</span>
            <span><i style={{ background: 'hsl(222 89% 55% / 0.2)' }} /> Leave</span>
            <span><i style={{ background: 'hsl(38 92% 50% / 0.2)' }} /> Holiday</span>
            <span><i style={{ background: 'hsl(var(--secondary))' }} /> Weekend</span>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="panel">
          <PanelHeading eyebrow="RECENT" title="Attendance history" />
          {attendanceList.length === 0 ? <EmptyLine text="No attendance records yet" /> : (
            <table className="att-table">
              <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Break</th><th>Status</th></tr></thead>
              <tbody>
                {attendanceList.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.work_date)}</td>
                    <td>{formatTime(a.check_in)}</td>
                    <td>{formatTime(a.check_out)}</td>
                    <td>{a.total_break_minutes ? `${Math.round(a.total_break_minutes)}m` : '—'}</td>
                    <td><StatusPill status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function RegModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-heading">
          <div><p className="eyebrow">CORRECTION</p><h2>Regularization request</h2></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label>Date<input type="date" name="workDate" required /></label>
          <label>Reason
            <select name="reason" defaultValue="Forgot to check in">
              <option>Forgot to check in</option>
              <option>Forgot to check out</option>
              <option>Wrong check-in time</option>
              <option>System/network issue</option>
              <option>Approved WFH not logged</option>
              <option>Other</option>
            </select>
          </label>
          <div className="form-row">
            <label>Correct check-in<input type="time" name="checkIn" /></label>
            <label>Correct check-out<input type="time" name="checkOut" /></label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button">Submit <ArrowRight size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OtModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-heading">
          <div><p className="eyebrow">EXTRA HOURS</p><h2>Overtime request</h2></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label>Date<input type="date" name="workDate" required /></label>
          <label>Hours (max 6)<input type="number" name="hours" min="0.5" max="6" step="0.5" required /></label>
          <label>Reason<textarea name="reason" placeholder="Why was overtime needed?" required /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button">Submit <ArrowRight size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}
