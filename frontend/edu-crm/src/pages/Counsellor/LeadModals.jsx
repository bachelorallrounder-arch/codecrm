// src/pages/Counsellor/LeadModals.jsx
import React, { useState } from "react";
import "./counsellorLeads.css";

/* ModalShell reused from original; kept minimal */
function ModalShell({ title, children, onClose }) {
  return (
    <div className="cl-modal-backdrop">
      <div className="cl-modal">
        <div className="cl-modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
        <div className="cl-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function AttemptModal({ lead, onClose, onSave }) {
  const [result, setResult] = useState("no_answer");
  const [remark, setRemark] = useState("");
  async function save() {
    if (!result) {
      alert("Select result");
      return;
    }
    await onSave(lead._id || lead.id, { result, remark });
    onClose();
  }
  return (
    <ModalShell title={`Add Attempt — ${lead.name}`} onClose={onClose}>
      <div>
        <label className="cl-label">Result</label>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="cl-input"
        >
          <option value="no_answer">No answer</option>
          <option value="connected">Connected</option>
          <option value="interested">Interested</option>
          <option value="call_back">Call back</option>
          <option value="not_interested">Not Interested</option>
          <option value="fee_enquiry">Fee enquiry</option>
          <option value="demo_request">Demo request</option>
        </select>

        <label className="cl-label">Remark</label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          rows={4}
          className="cl-input"
        />

        <div className="cl-modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={save} className="btn-primary">Save</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function RemarkModal({ lead, onClose, onSave }) {
  const [text, setText] = useState("");
  const [next_follow_up, setNext] = useState("");
  async function save() {
    if (!text.trim()) {
      alert("Add remark");
      return;
    }
    if (!next_follow_up) {
      alert("next_follow_up is mandatory for remark");
      return;
    }
    await onSave(
      lead._id || lead.id,
      text,
      new Date(next_follow_up).toISOString()
    );
    onClose();
  }
  return (
    <ModalShell title={`Add Remark — ${lead.name}`} onClose={onClose}>
      <div>
        <label className="cl-label">Remark</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="cl-input"
        />
        <label className="cl-label">Next follow-up</label>
        <input
          type="datetime-local"
          value={next_follow_up}
          onChange={(e) => setNext(e.target.value)}
          className="cl-input"
        />
        <div className="cl-modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={save} className="btn-primary">Save</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function DemoModal({ lead, onClose, onSave }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [trainer, setTrainer] = useState("");
  async function save() {
    if (!date) {
      alert("Pick date");
      return;
    }
    await onSave(lead._id || lead.id, { date, time, trainer });
    onClose();
  }
  return (
    <ModalShell title={`Book Demo — ${lead.name}`} onClose={onClose}>
      <div>
        <label className="cl-label">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cl-input" />
        <label className="cl-label">Time</label>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="cl-input" />
        <label className="cl-label">Trainer (optional)</label>
        <input value={trainer} onChange={(e) => setTrainer(e.target.value)} className="cl-input" />
        <div className="cl-modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={save} className="btn-primary">Book</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ConvertModal({ lead, onClose, onSave }) {
  const [course, setCourse] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [paymentMode, setPaymentMode] = useState("online");
  const [joiningDate, setJoiningDate] = useState("");
  async function save() {
    if (!course || !amount) {
      alert("Course and amount required");
      return;
    }
    await onSave(lead._id || lead.id, {
      course,
      amount_paid: Number(amount),
      total_fee: Number(fee),
      payment_mode: paymentMode,
      joining_date: joiningDate,
    });
    onClose();
  }
  return (
    <ModalShell title={`Convert Lead — ${lead.name}`} onClose={onClose}>
      <div>
        <label className="cl-label">Course</label>
        <input value={course} onChange={(e) => setCourse(e.target.value)} className="cl-input" />
        <label className="cl-label">Amount</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="cl-input" />
        <label className="cl-label">Total Fee</label>
        <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} className="cl-input" />
        <label className="cl-label">Payment mode</label>
        <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="cl-input">
          <option value="online">Online</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
        </select>
        <label className="cl-label">Joining date</label>
        <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="cl-input" />
        <div className="cl-modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={save} className="btn-primary">Convert</button>
        </div>
      </div>
    </ModalShell>
  );
}
