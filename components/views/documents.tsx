'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  FileText, CreditCard, Upload, Download, Trash2, Plus,
  ArrowRight, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { Profile, PayrollRecord, DocumentRecord } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { PageHeading, PanelHeading, StatusPill, EmptyLine } from '@/components/shared';

type Tab = 'documents' | 'payslips';

export function DocumentsView({ profile, isStaff }: { profile: Profile | null; isStaff: boolean }) {
  const [tab, setTab] = useState<Tab>('documents');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAll();
  }, [profile?.id]);

  const loadAll = async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [docRes, payRes] = await Promise.all([
      supabase.from('documents').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('payroll_records').select('*').eq('user_id', profile.id).order('pay_month', { ascending: false }),
    ]);
    setDocuments((docRes.data as DocumentRecord[] | null) ?? []);
    setPayrolls((payRes.data as PayrollRecord[] | null) ?? []);
    setLoading(false);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file') as File;
    const category = String(form.get('category'));
    if (!file || !profile) return;

    const ext = file.name.split('.').pop();
    const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, file);
    if (upErr) { toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' }); return; }

    const { data, error } = await supabase.from('documents').insert({
      name: file.name,
      category,
      storage_path: path,
      status: 'pending',
    }).select().maybeSingle();
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    if (data) {
      setDocuments((current) => [data as DocumentRecord, ...current]);
      setShowUpload(false);
      toast({ title: 'Document uploaded', description: 'Your document is pending review.' });
    }
  };

  const handleDeleteDoc = async (doc: DocumentRecord) => {
    if (!profile) return;
    await supabase.storage.from('employee-documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDocuments((current) => current.filter((d) => d.id !== doc.id));
    toast({ title: 'Document deleted' });
  };

  const downloadFile = async (path: string, name: string, bucket: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) { toast({ title: 'Download failed', description: 'Could not generate download link.', variant: 'destructive' }); return; }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <>
      <PageHeading eyebrow="GEVORA HRMS" title="Documents" subtitle="Keep your employee records complete and current." />

      <div className="tabs-bar">
        <button className={`tab-button ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}><FileText size={15} /> Documents</button>
        <button className={`tab-button ${tab === 'payslips' ? 'active' : ''}`} onClick={() => setTab('payslips')}><CreditCard size={15} /> Payslips</button>
      </div>

      {tab === 'documents' && (
        <div className="panel large-panel">
          <PanelHeading
            eyebrow="YOUR RECORDS"
            title="Document center"
            action={<button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={16} /> Upload</button>}
          />
          {loading ? <EmptyLine text="Loading documents…" /> : documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={24} />
              <b>No documents yet</b>
              <span>Upload identity, tax, and employment documents for HR review.</span>
              <button className="primary-button" onClick={() => setShowUpload(true)}>Upload a document <ArrowRight size={16} /></button>
            </div>
          ) : (
            <div>
              {documents.map((doc) => (
                <div className="doc-row" key={doc.id}>
                  <div className="doc-icon"><FileText size={18} /></div>
                  <div className="doc-info"><b>{doc.name}</b><span>{doc.category} · {formatDate(doc.created_at.slice(0, 10))}</span></div>
                  <StatusPill status={doc.status} />
                  <div className="doc-actions">
                    <button className="icon-action" onClick={() => downloadFile(doc.storage_path, doc.name, 'employee-documents')} aria-label="Download"><Download size={15} /></button>
                    <button className="icon-action" onClick={() => handleDeleteDoc(doc)} aria-label="Delete"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSubmit={handleUpload} />}
        </div>
      )}

      {tab === 'payslips' && (
        <div className="panel large-panel">
          <PanelHeading eyebrow="PAYROLL" title="Your payslips" />
          {payrolls.length === 0 ? (
            <div className="empty-state">
              <CreditCard size={24} />
              <b>No payslips yet</b>
              <span>Once payroll is processed, monthly payslips will appear here with secure download access.</span>
            </div>
          ) : (
            <div>
              {payrolls.map((pay) => (
                <div className="doc-row" key={pay.id}>
                  <div className="doc-icon"><CreditCard size={18} /></div>
                  <div className="doc-info">
                    <b>{pay.pay_month}</b>
                    <span>Net: {pay.net_salary.toLocaleString()} · Gross: {pay.gross_salary.toLocaleString()}</span>
                  </div>
                  <StatusPill status={pay.status} />
                  <div className="doc-actions">
                    {pay.storage_path && (
                      <button className="icon-action" onClick={() => downloadFile(pay.storage_path!, `${pay.pay_month}-payslip.pdf`, 'employee-documents')} aria-label="Download"><Download size={15} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function UploadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-heading">
          <div><p className="eyebrow">UPLOAD</p><h2>Upload document</h2></div>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label>Category
            <select name="category" defaultValue="ID proof">
              <option>ID proof</option>
              <option>Tax document</option>
              <option>Employment letter</option>
              <option>Contract</option>
              <option>Other</option>
            </select>
          </label>
          <label>File<input type="file" name="file" required /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button"><Upload size={16} /> Upload</button>
          </div>
        </form>
      </div>
    </div>
  );
}
