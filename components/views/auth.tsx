'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export function AuthScreen({ mode, setMode, onSubmit, busy, error, message }: {
  mode: 'signin' | 'signup' | 'forgot';
  setMode: (mode: 'signin' | 'signup' | 'forgot') => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
  message: string;
}) {
  const isForgot = mode === 'forgot';
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <div className="auth-visual-top">
          <div className="brand-lockup light-brand">
            <div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div>
            <div><strong>Gevora</strong><span>HRMS</span></div>
          </div>
          <span className="secure-badge"><ShieldCheck size={14} /> Enterprise ready</span>
        </div>
        <div className="auth-hero">
          <p className="eyebrow">THE PEOPLE OPERATING SYSTEM</p>
          <h1>Make every day at work <em>count.</em></h1>
          <p>One calm, connected workspace for your people, payroll, and progress.</p>
          <div className="auth-stats">
            <div><b>32</b><span>Team members</span></div>
            <div><b>98%</b><span>On-time payroll</span></div>
            <div><b>4.9</b><span>Team sentiment</span></div>
          </div>
        </div>
        <div className="auth-visual-footer">
          <span>Trusted by modern teams</span>
          <div className="trusted-logos"><b>northstar</b><b>ARC</b><b>lumin</b></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-auth-brand">
            <div className="brand-image"><img src="/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png" alt="Gevora logo" /></div>
            <strong>Gevora <span>HRMS</span></strong>
          </div>
          <div className="auth-heading">
            <span className="eyebrow">{isForgot ? 'ACCOUNT RECOVERY' : mode === 'signup' ? 'GET STARTED' : 'WELCOME BACK'}</span>
            <h2>{isForgot ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
            <p>{isForgot ? 'Enter your work email and we’ll send a secure reset link.' : mode === 'signup' ? 'Set up your secure people workspace in minutes.' : 'Sign in to your people workspace.'}</p>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            {mode === 'signup' && <label>Full name<input name="fullName" type="text" placeholder="Alex Morgan" required /></label>}
            <label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>
            {!isForgot && (
              <label>Password
                <div className="password-field">
                  <input name="password" type={showPassword ? 'text' : 'password'} placeholder="At least 8 characters" minLength={8} required />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </label>
            )}
            {error && <div className="form-error">{error}</div>}
            {message && <div className="form-success">{message}</div>}
            <button className="primary-button auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : isForgot ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-switch">
            {isForgot ? <button onClick={() => setMode('signin')}>Back to sign in</button> : (
              <>
                {mode === 'signin' ? <><span>New to Gevora?</span><button onClick={() => setMode('signup')}>Create an account</button></> : <><span>Already have an account?</span><button onClick={() => setMode('signin')}>Sign in</button></>}
              </>
            )}
          </div>
          {mode === 'signin' && <button className="forgot-link" onClick={() => setMode('forgot')}>Forgot password?</button>}
          <small className="auth-legal">By continuing, you agree to Gevora’s Terms and Privacy Policy.</small>
        </div>
      </section>
    </main>
  );
}
