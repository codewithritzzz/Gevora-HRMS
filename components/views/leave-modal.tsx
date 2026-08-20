'use client';

import { FormEvent } from 'react';
import { ArrowRight, X, CalendarDays } from 'lucide-react';

export function LeaveModal({ onClose, onSubmit }: { onClose: () => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void }) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate'));
    const endDate = String(form.get('endDate'));
    const reason = String(form.get('reason'));
    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    // This will be handled by parent via a passed handler if needed
    if (onSubmit) {
      onSubmit(event);
    } else {
      // Fallback: dispatch event with constructed data
      onClose();
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-heading">
          <div><p className="eyebrow">TIME OFF</p><h2>Apply for leave</h2></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>Leave type
            <select name="leaveType" defaultValue="Annual leave">
              <option>Annual leave</option>
              <option>Sick leave</option>
              <option>Personal day</option>
            </select>
          </label>
          <div className="form-row">
            <label>From<input type="date" name="startDate" required /></label>
            <label>To<input type="date" name="endDate" required /></label>
          </div>
          <label>Reason<textarea name="reason" placeholder="Add a note for your manager" required /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button">Submit request <ArrowRight size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}
