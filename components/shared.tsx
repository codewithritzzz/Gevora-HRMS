'use client';

import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  MoreHorizontal,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';

export function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Clock3; tone: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={18} /></div>
      <span className="metric-label">{label}</span>
      <b className="metric-value">{value}</b>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

export function ActivityRow({ icon: Icon, title, detail, time, color }: { icon: typeof Check; title: string; detail: string; time: string; color: string }) {
  return (
    <div className="activity-row">
      <div className={`activity-icon ${color}`}><Icon size={15} /></div>
      <div><b>{title}</b><span>{detail}</span></div>
      <time>{time}</time>
    </div>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return <div className="empty-line"><FileText size={16} /><span>{text}</span></div>;
}

export function StatusPill({ status }: { status: string }) {
  const display = status.replace(/_/g, ' ');
  return <span className={`status-pill ${status}`}>{display}</span>;
}

export function SimplePanel({ icon: Icon, title, text, action, onAction }: { icon: typeof FileText; title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel empty-state full-empty">
      <div className="empty-icon"><Icon size={24} /></div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <button className="primary-button" onClick={onAction}>{action}<ArrowRight size={16} /></button>}
    </div>
  );
}

export function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}<span className="heading-dot">.</span></h1>
        <p className="subheading">{subtitle}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </section>
  );
}

export function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {action}
    </div>
  );
}

export function Avatar({ name, src, size = 'default' }: { name: string; src?: string | null; size?: 'small' | 'default' | 'large' }) {
  const sizeClass = size === 'small' ? 'avatar small-avatar' : size === 'large' ? 'avatar large-avatar' : 'avatar';
  const inits = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  if (src) return <div className={sizeClass} style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-label={name} />;
  return <div className={sizeClass} aria-label={name}>{inits}</div>;
}

export function Footer() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} Gevora HRMS</span>
      <div className="footer-links">
        <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">Instagram</a>
        <a href="https://linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn">LinkedIn</a>
        <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X">X</a>
      </div>
    </footer>
  );
}

export { CalendarDays, Check, Clock3, FileText, MoreHorizontal, ShieldCheck };
