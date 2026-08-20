'use client';

import { useEffect, useState } from 'react';
import { Search, ChevronDown, Plus, Check, X, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { EmployeePresence, Profile, RegularizationRequest, OvertimeRequest, LeaveRequest } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { PageHeading, PanelHeading, Avatar, StatusPill, EmptyLine } from '@/components/shared';

export function PeopleView({ isStaff }: { isStaff: boolean }) {
  const [people, setPeople] = useState<EmployeePresence[]>([]);
  const [filtered, setFiltered] = useState<EmployeePresence[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [departments, setDepartments] = useState<string[]>([]);
  const [regApprovals, setRegApprovals] = useState<RegularizationRequest[]>([]);
  const [otApprovals, setOtApprovals] = useState<OvertimeRequest[]>([]);
  const [leaveApprovals, setLeaveApprovals] = useState<LeaveRequest[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [showOrg, setShowOrg] = useState(false);
  const [orgData, setOrgData] = useState<Profile[]>([]);

  useEffect(() => {
    void loadPeople();
    void loadApprovals();
  }, []);

  const loadPeople = async () => {
    const { data } = await supabase.from('employee_presence').select('*');
    const list = (data as EmployeePresence[] | null) ?? [];
    setPeople(list);
    setFiltered(list);
    const depts = Array.from(new Set(list.map((p) => p.department).filter(Boolean))) as string[];
    setDepartments(depts);
  };

  const loadApprovals = async () => {
    const [regRes, otRes, leaveRes, profRes] = await Promise.all([
      supabase.from('regularization_requests').select('*, profiles!regularization_requests_user_id_fkey(full_name)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('overtime_requests').select('*, profiles!overtime_requests_user_id_fkey(full_name)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('leave_requests').select('*, user_id').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, reports_to, designation, department, avatar_url'),
    ]);
    setRegApprovals((regRes.data as RegularizationRequest[] | null) ?? []);
    setOtApprovals((otRes.data as OvertimeRequest[] | null) ?? []);
    setLeaveApprovals((leaveRes.data as (LeaveRequest & { user_id: string })[] | null) ?? []);
    const profs = (profRes.data as Profile[] | null) ?? [];
    const map = new Map<string, string>();
    profs.forEach((p) => map.set(p.id, p.full_name));
    setProfilesMap(map);
    setOrgData(profs);
  };

  useEffect(() => {
    let result = people;
    if (search.trim()) result = result.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()));
    if (deptFilter !== 'all') result = result.filter((p) => p.department === deptFilter);
    setFiltered(result);
  }, [search, deptFilter, people]);

  const approveReg = async (id: string) => {
    const { error } = await supabase.rpc('approve_regularization', { p_request_id: id });
    if (error) { toast({ title: 'Approval failed', description: error.message, variant: 'destructive' }); return; }
    setRegApprovals((current) => current.filter((r) => r.id !== id));
    toast({ title: 'Regularization approved' });
  };

  const rejectReg = async (id: string) => {
    const { error } = await supabase.rpc('reject_regularization', { p_request_id: id });
    if (error) { toast({ title: 'Rejection failed', description: error.message, variant: 'destructive' }); return; }
    setRegApprovals((current) => current.filter((r) => r.id !== id));
    toast({ title: 'Regularization rejected' });
  };

  const approveOt = async (id: string) => {
    const { error } = await supabase.rpc('approve_overtime', { p_request_id: id });
    if (error) { toast({ title: 'Approval failed', description: error.message, variant: 'destructive' }); return; }
    setOtApprovals((current) => current.filter((r) => r.id !== id));
    toast({ title: 'Overtime approved' });
  };

  const rejectOt = async (id: string) => {
    const { error } = await supabase.rpc('reject_overtime', { p_request_id: id });
    if (error) { toast({ title: 'Rejection failed', description: error.message, variant: 'destructive' }); return; }
    setOtApprovals((current) => current.filter((r) => r.id !== id));
    toast({ title: 'Overtime rejected' });
  };

  const approveLeave = async (id: string) => {
    const { error } = await supabase.rpc('approve_leave', { p_request_id: id });
    if (error) { toast({ title: 'Approval failed', description: error.message, variant: 'destructive' }); return; }
    setLeaveApprovals((current) => current.filter((l) => l.id !== id));
    toast({ title: 'Leave approved', description: 'Calendar updated with paid leave days.' });
  };

  const rejectLeave = async (id: string) => {
    const { error } = await supabase.rpc('reject_leave', { p_request_id: id });
    if (error) { toast({ title: 'Rejection failed', description: error.message, variant: 'destructive' }); return; }
    setLeaveApprovals((current) => current.filter((l) => l.id !== id));
    toast({ title: 'Leave rejected' });
  };

  const pendingCount = regApprovals.length + otApprovals.length + leaveApprovals.length;

  return (
    <>
      <PageHeading eyebrow="GEVORA HRMS" title="People" subtitle="The team behind Gevora Holdings.">
        <button className="secondary-button" onClick={() => setShowOrg((v) => !v)}><Building2 size={16} /> {showOrg ? 'Hide' : 'Show'} org chart</button>
      </PageHeading>

      {(pendingCount > 0) && (
        <div className="notice-banner">
          <div className="notice-icon"><Check size={18} /></div>
          <div><b>{pendingCount} approvals waiting</b><span>{regApprovals.length} regularization · {otApprovals.length} overtime · {leaveApprovals.length} leave</span></div>
        </div>
      )}

      {regApprovals.length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <PanelHeading eyebrow="PENDING" title="Regularization approvals" />
          {regApprovals.map((r) => (
            <div className="approval-card" key={r.id}>
              <div className="ac-info">
                <b>{profilesMap.get(r.user_id) ?? 'Employee'} — {r.reason}</b>
                <span>{formatDate(r.work_date)}</span>
              </div>
              <div className="approval-actions">
                <button className="approve-btn" onClick={() => approveReg(r.id)}><Check size={14} /> Approve</button>
                <button className="reject-btn" onClick={() => rejectReg(r.id)}><X size={14} /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {otApprovals.length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <PanelHeading eyebrow="PENDING" title="Overtime approvals" />
          {otApprovals.map((o) => (
            <div className="approval-card" key={o.id}>
              <div className="ac-info">
                <b>{profilesMap.get(o.user_id) ?? 'Employee'} — {o.hours_requested} hours</b>
                <span>{formatDate(o.work_date)} · {o.reason}</span>
              </div>
              <div className="approval-actions">
                <button className="approve-btn" onClick={() => approveOt(o.id)}><Check size={14} /> Approve</button>
                <button className="reject-btn" onClick={() => rejectOt(o.id)}><X size={14} /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {leaveApprovals.length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <PanelHeading eyebrow="PENDING" title="Leave approvals" />
          {leaveApprovals.map((l) => (
            <div className="approval-card" key={l.id}>
              <div className="ac-info">
                <b>{profilesMap.get((l as LeaveRequest & { user_id: string }).user_id) ?? 'Employee'} — {l.leave_type}</b>
                <span>{formatDate(l.start_date)} – {formatDate(l.end_date)} · {l.days} days · {l.reason}</span>
              </div>
              <div className="approval-actions">
                <button className="approve-btn" onClick={() => approveLeave(l.id)}><Check size={14} /> Approve</button>
                <button className="reject-btn" onClick={() => rejectLeave(l.id)}><X size={14} /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showOrg && <OrgChart profiles={orgData} />}

      <div className="panel large-panel">
        <PanelHeading eyebrow="DIRECTORY" title="People at Gevora" />
        <div className="directory-toolbar">
          <div className="inline-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', flex: 1, color: 'hsl(var(--foreground))', fontSize: '0.8125rem' }}
            />
          </div>
          <button className="secondary-button" onClick={() => setDeptFilter(deptFilter === 'all' ? departments[0] ?? 'all' : 'all')}>
            {deptFilter === 'all' ? 'All departments' : deptFilter} <ChevronDown size={15} />
          </button>
        </div>

        {filtered.length === 0 ? <EmptyLine text="No people found" /> : (
          <div className="people-list">
            {filtered.map((person) => (
              <div className="person-row" key={person.id}>
                <Avatar name={person.full_name} src={person.avatar_url} />
                <div><b>{person.full_name}</b><span>{person.designation} · {person.department}</span></div>
                <span className={`sr-status ${person.today_status}`}>{person.today_status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OrgChart({ profiles }: { profiles: Profile[] }) {
  const roots = profiles.filter((p) => !p.reports_to);
  const childrenOf = (id: string) => profiles.filter((p) => p.reports_to === id);

  const renderNode = (person: Profile): React.ReactNode => {
    const children = childrenOf(person.id);
    return (
      <div className="org-node" key={person.id}>
        <div className="org-node-card">
          <Avatar name={person.full_name} src={person.avatar_url} size="small" />
          <div><b>{person.full_name}</b><span>{person.designation}</span></div>
        </div>
        {children.length > 0 && (
          <div className="org-children">
            {children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <PanelHeading eyebrow="WORKFORCE" title="Organization hierarchy" />
      <div className="org-chart">
        {roots.length === 0 ? <EmptyLine text="No hierarchy data yet" /> : roots.map(renderNode)}
      </div>
    </div>
  );
}
