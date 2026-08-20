'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, CalendarDays, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { Profile, LeaveRequest, LeaveBalance } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { StatusPill, EmptyLine } from '@/components/shared';
import { LeaveModal } from '@/components/views/leave-modal';

export function LeaveView({ profile }: { profile: Profile | null; onApplyLeave?: () => void }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  useEffect(() => {
    void loadRequests();
    void loadBalance();
  }, [profile?.id]);

  const loadRequests = async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase.from('leave_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    setRequests((data as LeaveRequest[] | null) ?? []);
    setLoading(false);
  };

  const loadBalance = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('leave_balance_view').select('*').eq('user_id', profile.id).maybeSingle();
    setBalance(data as LeaveBalance | null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate'));
    const endDate = String(form.get('endDate'));
    const reason = String(form.get('reason'));
    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const { data, error } = await supabase.from('leave_requests').insert({ leave_type: String(form.get('leaveType')), start_date: startDate, end_date: endDate, days, reason, status: 'pending' }).select().maybeSingle();
    if (error) { toast({ title: 'Leave request failed', description: error.message, variant: 'destructive' }); return; }
    if (data) {
      setRequests((current) => [data as LeaveRequest, ...current]);
      setShowForm(false);
      void loadBalance();
      toast({ title: 'Leave requested', description: 'Your manager will review it shortly.' });
    }
  };

  const available = balance?.available?.toFixed(1) ?? '0.0';
  const used = balance?.used_days?.toFixed(1) ?? '0.0';
  const accrued = balance?.accrued?.toFixed(1) ?? '0.0';

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">GEVORA HRMS</p><h1>Leave<span className="heading-dot">.</span></h1><p className="subheading">Plan time away and follow requests in one place.</p></div>
        <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={16} /> Apply leave</button>
      </section>

      <div className="workspace-cards">
        <div className="panel large-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">REQUEST HISTORY</p><h2>Your requests</h2></div>
            <StatusPill status={`${available} days available`} />
          </div>
          {loading ? (
            <EmptyLine text="Loading your requests…" />
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <CalendarDays size={24} />
              <b>No requests yet</b>
              <span>When you apply for leave, it will show up here.</span>
              <button className="secondary-button" onClick={() => setShowForm(true)}>Apply your first request</button>
            </div>
          ) : (
            <div className="request-table">
              {requests.map((r) => (
                <div className="request-row" key={r.id}>
                  <div><b>{r.leave_type}</b><span>{formatDate(r.start_date)} – {formatDate(r.end_date)}</span></div>
                  <span>{r.days} days</span>
                  <StatusPill status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel side-stat">
          <p className="eyebrow">LEAVE BALANCE</p>
          <div className="big-stat">{available} <small>days</small></div>
          <span>Available across your leave policies.</span>
          <div className="stat-divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span className="muted-label">Accrued <b style={{ float: 'right' }}>{accrued}</b></span>
            <span className="muted-label">Used <b style={{ float: 'right' }}>{used}</b></span>
            <span className="muted-label">Available <b style={{ float: 'right' }}>{available}</b></span>
          </div>
        </div>
      </div>

      {showForm && <LeaveModal onClose={() => setShowForm(false)} onSubmit={handleSubmit} />}
    </>
  );
}
