'use client';

import { Activity } from 'lucide-react';
import { PageHeading } from '@/components/shared';

export function ReportsView() {
  return (
    <>
      <PageHeading eyebrow="GEVORA HRMS" title="Reports" subtitle="Clear signals for better people decisions." />
      <div className="report-grid">
        <div className="panel report-card">
          <p className="eyebrow">HEADCOUNT</p>
          <b>32</b>
          <span>+8.4% vs last month</span>
          <div className="fake-chart bars"><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
        <div className="panel report-card">
          <p className="eyebrow">ATTENDANCE RATE</p>
          <b>94.8%</b>
          <span>+2.1% vs last month</span>
          <div className="fake-chart line-chart">
            <svg viewBox="0 0 300 70" preserveAspectRatio="none"><path d="M0 56 C35 53 42 32 76 40 S124 56 158 28 S206 44 242 18 S275 25 300 8" /></svg>
          </div>
        </div>
        <div className="panel report-card wide-report">
          <div>
            <p className="eyebrow">TEAM PULSE</p>
            <h2>People analytics</h2>
            <p>Reports become available as your workspace collects more activity.</p>
          </div>
          <div className="pulse-score"><b>4.9</b><span>out of 5</span></div>
        </div>
      </div>
    </>
  );
}
