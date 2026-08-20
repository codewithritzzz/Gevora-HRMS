export const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export const initials = (name: string) =>
  name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatSeconds = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};

export const formatHM = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h} Hr ${m} Min`;
};

export const elapsedSeconds = (fromISO: string, toISO?: string | null) => {
  const from = new Date(fromISO).getTime();
  const to = toISO ? new Date(toISO).getTime() : Date.now();
  return Math.max(0, Math.floor((to - from) / 1000));
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export const shiftDurationHours = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - sh * 60 - sm;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
};

export const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    checked_in: 'Checked in',
    on_break: 'On break',
    checked_out: 'Checked out',
    not_checked_in: 'Not checked in yet',
  };
  return map[status] ?? status;
};

export const attendanceStatusColor = (status: string) => {
  const map: Record<string, string> = {
    present: 'green',
    late: 'orange',
    absent: 'red',
    leave: 'blue',
    holiday: 'pale',
    missing_punch: 'red',
  };
  return map[status] ?? 'pale';
};

export const monthName = (date: Date) =>
  date.toLocaleDateString([], { month: 'long', year: 'numeric' });

export const addMonths = (date: Date, n: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

export const isToday = (date: Date) => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

export const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

export const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};
