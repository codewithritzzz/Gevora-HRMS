'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';
import { Sun, Moon, Monitor, Upload, ShieldCheck, Check, ArrowRight, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { Profile } from '@/lib/types';
import { PageHeading, PanelHeading, Avatar } from '@/components/shared';

export function SettingsView({ profile, onSaveTheme, onProfileUpdate }: {
  profile: Profile | null;
  onSaveTheme: (theme: 'light' | 'dark' | 'system') => void;
  onProfileUpdate: () => void;
}) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(profile?.theme ?? 'system');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTheme(profile?.theme ?? 'system'); }, [profile?.theme]);

  const themes: Array<{ id: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  const handleTheme = (next: 'light' | 'dark' | 'system') => {
    setTheme(next);
    onSaveTheme(next);
    toast({ title: 'Theme updated', description: `Switched to ${next} mode.` });
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('profiles').update({
      full_name: String(form.get('fullName')),
      phone: String(form.get('phone')),
      personal_email: String(form.get('personalEmail')),
      emergency_contact_name: String(form.get('emergencyName')),
      emergency_contact_number: String(form.get('emergencyNumber')),
      address: String(form.get('address')),
    }).eq('id', profile.id);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    setEditing(false);
    onProfileUpdate();
    toast({ title: 'Profile updated', description: 'Your details have been saved.' });
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' }); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;
    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id);
    setUploading(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    onProfileUpdate();
    toast({ title: 'Profile picture updated' });
  };

  return (
    <>
      <PageHeading eyebrow="GEVORA HRMS" title="Settings" subtitle="Make Gevora work the way you do." />

      <div className="settings-grid">
        <div className="panel">
          <PanelHeading
            eyebrow="YOUR PROFILE"
            title="Personal details"
            action={<button className="secondary-button" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</button>}
          />
          {!editing ? (
            <div className="settings-avatar-upload" style={{ marginBottom: '1.5rem' }}>
              <Avatar name={profile?.full_name ?? 'New employee'} src={profile?.avatar_url} size="large" />
              <div>
                <b style={{ fontSize: '1.0625rem', display: 'block' }}>{profile?.full_name ?? 'New employee'}</b>
                <span style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', display: 'block', marginTop: '0.1875rem' }}>{profile?.designation ?? 'Team member'} · {profile?.department ?? 'People Operations'}</span>
                <span style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', display: 'block' }}>{profile?.email}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileSave} className="gev-form" style={{ maxWidth: '100%' }}>
              <div className="settings-avatar-upload" style={{ marginBottom: '1rem' }}>
                <Avatar name={profile?.full_name ?? 'New employee'} src={profile?.avatar_url} size="large" />
                <div>
                  <button type="button" className="upload-button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload size={15} /> {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                </div>
              </div>
              <label>Full name<input type="text" name="fullName" defaultValue={profile?.full_name ?? ''} required /></label>
              <label>Phone<input type="tel" name="phone" defaultValue={profile?.phone ?? ''} placeholder="+1 555 000 0000" /></label>
              <label>Personal email<input type="email" name="personalEmail" defaultValue={profile?.personal_email ?? ''} placeholder="personal@example.com" /></label>
              <label>Emergency contact name<input type="text" name="emergencyName" defaultValue={profile?.emergency_contact_name ?? ''} placeholder="Contact person" /></label>
              <label>Emergency contact number<input type="tel" name="emergencyNumber" defaultValue={profile?.emergency_contact_number ?? ''} placeholder="+1 555 000 0000" /></label>
              <label>Address<textarea name="address" defaultValue={profile?.address ?? ''} placeholder="Home address" /></label>
              <div><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <Check size={16} /></button></div>
            </form>
          )}
          {!editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {profile?.phone && <div><span className="muted-label">Phone</span><br /><b style={{ fontSize: '0.875rem' }}>{profile.phone}</b></div>}
              {profile?.personal_email && <div><span className="muted-label">Personal email</span><br /><b style={{ fontSize: '0.875rem' }}>{profile.personal_email}</b></div>}
              {profile?.emergency_contact_name && <div><span className="muted-label">Emergency contact</span><br /><b style={{ fontSize: '0.875rem' }}>{profile.emergency_contact_name} · {profile.emergency_contact_number}</b></div>}
              {profile?.address && <div><span className="muted-label">Address</span><br /><b style={{ fontSize: '0.875rem' }}>{profile.address}</b></div>}
            </div>
          )}
        </div>

        <div className="panel">
          <PanelHeading eyebrow="APPEARANCE" title="Theme" />
          <div className="theme-options" style={{ marginBottom: '1.5rem' }}>
            {themes.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={`theme-option ${theme === t.id ? 'active' : ''}`} onClick={() => handleTheme(t.id)}>
                  <Icon size={16} /> {t.label}
                </button>
              );
            })}
          </div>

          <PanelHeading eyebrow="SECURITY" title="Account protection" />
          <div className="security-row">
            <ShieldCheck size={18} />
            <div><b>Secure authentication</b><span>Email/password sign-in is active</span></div>
            <span className="secure-status">Protected</span>
          </div>
          <div className="security-row">
            <ShieldCheck size={18} />
            <div><b>Two-step verification</b><span>Authenticator app setup is available</span></div>
            <button className="text-button">Set up</button>
          </div>
        </div>
      </div>
    </>
  );
}
