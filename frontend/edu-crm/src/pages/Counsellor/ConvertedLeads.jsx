// src/pages/Counsellor/ConvertedLeads.jsx
import React, { useEffect, useState } from "react";
import { AdminAPI } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

/* ---------- Styles & small UI primitives ---------- */
const primaryBtn = {
  padding: "10px 14px",
  background: "#0f172a",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
};
const secondaryBtn = {
  padding: "8px 12px",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #e6e8eb",
  cursor: "pointer",
};
const smallBtn = {
  padding: "6px 10px",
  background: "#fff",
  borderRadius: 8,
  border: "1px solid #e6e8eb",
  cursor: "pointer",
  fontSize: 13,
};
const miniCard = { padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #eef2f7" };
const miniLabel = { fontSize: 12, color: "#6b7280" };
const miniValue = { marginTop: 6, fontWeight: 700 };
const statCard = { flex: 1, padding: 12, borderRadius: 10, background: "#fff", border: "1px solid #eef2f7", textAlign: "center" };
const statValue = { marginTop: 6, fontWeight: 800, fontSize: 18 };
const currency = "INR";
const moneyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
function formatMoney(n) { if (n == null || isNaN(Number(n))) return "—"; return moneyFormatter.format(Number(n)); }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function Badge({ children, style = {} }) { return <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#ecfeff", color: "#0f766e", fontWeight: 700, fontSize: 13, ...style }}>{children}</span>; }

/* ---------- Payment row: improved presentation + shows who added the payment ---------- */
function PaymentRow({ p }) {
  const amount = p.amount ?? p.value ?? p.amount_paid ?? 0;
  const when = p.date || p.paid_on || p.createdAt || p.created_at;
  const method = (p.method || p.payment_mode || p.paymentMethod || "—").toString();
  // prefer createdByName -> createdByObj.name -> createdBy (id fallback)
  const byName = p.createdByName || (p.createdByObj && (p.createdByObj.name || p.createdByObj.email)) || (typeof p.createdBy === "string" ? p.createdBy : null);

  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: 12,
      borderRadius: 12,
      background: "#fff",
      border: "1px solid #eef2f7",
      alignItems: "center",
      boxShadow: "0 6px 18px rgba(15,23,42,0.04)"
    }}>
      <div style={{ minWidth: 92, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #eef2f7" }}>
        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>{method}</div>
        <div style={{ marginTop: 6, fontWeight: 800, fontSize: 16 }}>{formatMoney(amount)}</div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>{p.note || "Payment entry"}</div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>{when ? dayjs(when).fromNow() : ""}</div>
        </div>
        <div style={{ color: "#6b7280", marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div>{when ? dayjs(when).format("DD MMM YYYY") : "—"}</div>
          <div>•</div>
          <div>By: <strong style={{ color: "#111827", marginLeft: 6 }}>{byName || "—"}</strong></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Payment modal ---------- */
function PaymentModal({ open, conversion, lead, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(conversion?.payment_mode || "online");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [note, setNote] = useState("");

  React.useEffect(() => {
    if (open) {
      setMethod(conversion?.payment_mode || "online");
      setAmount("");
      setNote("");
      setDate(dayjs().format("YYYY-MM-DD"));
    }
  }, [open, conversion, lead]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(2,6,23,0.44)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 520, maxWidth: "96%", background: "#fff", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{lead?.name ? `Update payment — ${lead.name}` : "Update payment"}</h3>
          <button onClick={onClose} style={smallBtn}>Close</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>Amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6 }} />

          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6 }}>
            <option value="online">Online</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="upi">UPI</option>
          </select>

          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>Paid on</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6 }} />

          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6, minHeight: 80 }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button onClick={() => {
            const amt = Number(amount || 0);
            if (!amt || amt <= 0) return alert("Enter a valid amount");
            onSubmit({ amount: amt, method, date, note });
          }} style={primaryBtn}>Add Payment</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Schedule modal (unchanged) ---------- */
function ScheduleModal({ open, conversion, lead, onClose, onSubmit }) {
  const [when, setWhen] = useState(dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm"));
  const [message, setMessage] = useState("");
  React.useEffect(() => {
    if (open) {
      setWhen(dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm"));
      setMessage("");
    }
  }, [open, conversion, lead]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(2,6,23,0.44)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 560, maxWidth: "96%", background: "#fff", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Schedule WhatsApp Reminder</h3>
          <button onClick={onClose} style={smallBtn}>Close</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>When</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6 }} />

          <label style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 600 }}>Message (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6, minHeight: 100 }} placeholder="Custom message (optional). If left blank a default reminder will be used." />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button onClick={() => {
            if (!when) return alert("Pick a date/time");
            onSubmit({ when, message });
          }} style={primaryBtn}>Schedule</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main component ---------- */
export default function ConvertedLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [convMap, setConvMap] = useState({});
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [convLoading, setConvLoading] = useState(false);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [activeConv, setActiveConv] = useState(null);
  const [activeLeadForConv, setActiveLeadForConv] = useState(null);

  useEffect(() => { loadConvertedLeads(); /* eslint-disable-next-line */ }, []);

  async function loadConvertedLeads() {
    setLoading(true);
    try {
      const res = await AdminAPI.getLeads({ status: "converted", limit: 500 });
      const arr = Array.isArray(res.leads) ? res.leads : (res?.data?.results || res?.data?.leads || res?.data || []);
      const list = Array.isArray(arr) ? arr : [];
      setLeads(list);
      if (list.length) await fetchConversionsAndPayments(list);
    } catch (err) {
      console.error("loadConvertedLeads error:", err);
      alert("Failed to load converted leads");
    } finally {
      setLoading(false);
    }
  }

  // utility: fetch a user by id (tries multiple response shapes)
  async function fetchUserById(id) {
    try {
      const r = await AdminAPI.rawGet(`/users/${id}`);
      const u = r?.data ?? r;
      if (!u) return null;
      return u;
    } catch (err) {
      // ignore individual lookup failures
      return null;
    }
  }

  // enrich payments map by resolving createdBy user names when missing
  async function enrichPaymentsWithUserNames(paymentsMapLocal) {
    // collect missing ids
    const missingIds = new Set();
    for (const cid of Object.keys(paymentsMapLocal)) {
      const arr = paymentsMapLocal[cid] || [];
      for (const p of arr) {
        const createdBy = p.createdBy;
        if (createdBy && typeof createdBy === "string" && !p.createdByName && !p.createdByObj) {
          // likely an ObjectId string
          missingIds.add(createdBy);
        }
      }
    }
    if (missingIds.size === 0) return paymentsMapLocal;

    // fetch users (do in parallel but keep it reasonable)
    const ids = Array.from(missingIds);
    const userMap = {};
    await Promise.all(ids.map(async (id) => {
      const u = await fetchUserById(id);
      if (u) userMap[id] = u;
    }));

    // attach resolved info
    for (const cid of Object.keys(paymentsMapLocal)) {
      const arr = paymentsMapLocal[cid] || [];
      for (const p of arr) {
        const createdBy = p.createdBy;
        if (createdBy && typeof createdBy === "string" && !p.createdByName && !p.createdByObj) {
          const u = userMap[createdBy];
          if (u) {
            p.createdByObj = u;
            p.createdByName = u.name || u.email || String(u._id);
          } else {
            // fallback to showing short id if no user found
            p.createdByName = createdBy;
          }
        } else if (p.createdBy && typeof p.createdBy === "object" && !p.createdByName) {
          // already populated object
          p.createdByObj = p.createdBy;
          p.createdByName = p.createdBy.name || p.createdBy.email || String(p.createdBy._id);
        }
      }
    }

    return paymentsMapLocal;
  }

  async function fetchConversionsAndPayments(leadList) {
    setConvLoading(true);
    const convs = {};
    const pays = {};
    const chunkSize = 8;
    try {
      // fetch conversion objects (or fallback to build from lead)
      for (let i = 0; i < leadList.length; i += chunkSize) {
        const chunk = leadList.slice(i, i + chunkSize);
        const promises = chunk.map(ld => AdminAPI.rawGet(`/conversions/${ld._id || ld.id}/converted`).catch(e => e));
        const results = await Promise.all(promises);
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          const lead = chunk[j];
          const lid = lead._id || lead.id;

          if (r && (r.data || r._id || r.id)) {
            const payload = r.data ?? r;
            convs[lid] = payload;
          } else if (lead.conversion) {
            convs[lid] = lead.conversion;
          } else if (Array.isArray(lead.conversions) && lead.conversions.length) {
            convs[lid] = lead.conversions[0];
          } else {
            // fallback: create a conversion-like object, ensure we don't duplicate `lead` key
            convs[lid] = {
              _id: lead.conversion?._id || `conv-${lid}`,
              lead: {
                _id: lid,
                ...lead,
                // preserve convertedBy if present (populated or id)
                convertedBy: lead.convertedBy ?? lead.convertedBy
              },
              course: lead.course_interest || lead.course,
              amount_paid: lead.amount_paid ?? lead.amount ?? 0,
              total_fee: lead.total_fee ?? lead.totalFee ?? null,
              payment_mode: lead.payment_mode,
              joining_date: lead.joining_date,
              createdAt: lead.convertedAt || lead.converted_on || lead.converted_at,
              createdBy: lead.createdBy ?? undefined,
              payments: [],
              reminders: []
            };
          }
        }
      }

      // collect conv ids and ask payments endpoint
      const convIds = Object.values(convs).map(c => c._id || c.id).filter(Boolean);
      for (let k = 0; k < convIds.length; k += chunkSize) {
        const chunk = convIds.slice(k, k + chunkSize);
        const promises = chunk.map(cid => AdminAPI.rawGet(`/conversions/${cid}/payments`).catch(e => e));
        const results = await Promise.all(promises);
        for (let m = 0; m < results.length; m++) {
          const r = results[m];
          const cid = chunk[m];
          if (r && Array.isArray(r.data)) {
            pays[cid] = r.data;
          } else if (r && r.data && Array.isArray(r.data.payments)) {
            pays[cid] = r.data.payments;
          } else {
            // fallback: try to use embedded payments or amountPaid from conv object
            const convObj = Object.values(convs).find(cv => String(cv._id || cv.id) === String(cid)) || {};
            if (Array.isArray(convObj.payments) && convObj.payments.length) pays[cid] = convObj.payments;
            else {
              const amt = Number(convObj.amount_paid ?? 0) || 0;
              pays[cid] = amt > 0 ? [{ amount: amt, method: convObj.payment_mode || convObj.paymentMethod, date: convObj.createdAt || convObj.paid_on }] : [];
            }
          }
        }
      }

      // Now ensure payments have createdByName where possible by resolving missing users
      const enrichedPays = await enrichPaymentsWithUserNames(pays);

      // store
      setConvMap(convs);
      setPaymentsMap(enrichedPays);
    } catch (err) {
      console.warn("fetchConversionsAndPayments error", err);
    } finally {
      setConvMap(prev => prev); // ensure stable reference if unchanged
      setPaymentsMap(prev => prev);
      setConvLoading(false);
    }
  }

  function computeAmounts(conv, payments) {
    const total = (conv?.total_fee ?? conv?.total ?? conv?.totalFee);
    if (Array.isArray(payments) && payments.length) {
      const sum = payments.reduce((s, p) => s + (Number(p.amount ?? p.value ?? 0) || 0), 0);
      return { paid: sum, total: (total != null ? Number(total) : null), remaining: (total != null ? Number(total) - sum : null) };
    }
    const paidFromConv = Number(conv?.amount_paid ?? 0) || 0;
    return { paid: paidFromConv, total: (total != null ? Number(total) : null), remaining: (total != null ? Number(total) - paidFromConv : null) };
  }

  async function addPayment(conv, lead, payment) {
    const convId = conv?._id || conv?.id;
    if (convId) {
      try {
        const r = await AdminAPI.rawPost(`/conversions/${convId}/payments`, {
          amount: payment.amount,
          method: payment.method,
          date: payment.date,
          note: payment.note
        });
        await loadConvertedLeads();
        return { ok: true, api: "payments", data: r?.data ?? r };
      } catch (err) {
        console.warn("POST /conversions/:id/payments failed — fallback", err?.message || err);
      }
    }
    try {
      const currentPaid = Number(conv?.amount_paid ?? 0) || 0;
      const newPaid = currentPaid + Number(payment.amount || 0);
      const body = {
        amount_paid: newPaid,
        total_fee: conv?.total_fee ?? conv?.total ?? undefined,
        payment_mode: payment.method,
        joining_date: conv?.joining_date ?? undefined
      };
      const r2 = await AdminAPI.rawPost(`/conversions/${lead._id || lead.id}/convert`, body);
      await loadConvertedLeads();
      return { ok: true, api: "convert-fallback", data: r2?.data ?? r2 };
    } catch (err2) {
      console.error("Fallback convert update failed", err2);
      return { ok: false, message: err2?.response?.data?.message || err2?.message || "Payment failed" };
    }
  }

  function openPaymentModal(conv, lead) {
    setActiveConv(conv);
    setActiveLeadForConv(lead);
    setPayModalOpen(true);
  }

  async function handleSubmitPayment({ amount, method, date, note }) {
    if (!activeConv && !activeLeadForConv) return;
    const conv = activeConv;
    const lead = activeLeadForConv;
    const res = await addPayment(conv, lead, { amount, method, date, note });
    if (res.ok) {
      alert("Payment recorded");
      setPayModalOpen(false);
      setActiveConv(null);
      setActiveLeadForConv(null);
    } else {
      alert("Payment failed: " + (res.message || "unknown"));
    }
  }

  function openScheduleModal(conv, lead) {
    setActiveConv(conv);
    setActiveLeadForConv(lead);
    setScheduleModalOpen(true);
  }
  async function handleSchedule({ when, message }) {
    if (!activeLeadForConv && !activeConv) return;
    const conv = activeConv;
    const lead = activeLeadForConv;
    const convId = conv?._id || conv?.id;
    try {
      if (convId) {
        await AdminAPI.rawPost(`/conversions/${convId}/schedule-reminder`, { when, message });
      } else {
        await AdminAPI.rawPost(`/conversions/${lead._id || lead.id}/schedule-reminder`, { when, message });
      }
      alert("Reminder scheduled");
      setScheduleModalOpen(false);
      setActiveConv(null);
      setActiveLeadForConv(null);
      await loadConvertedLeads();
    } catch (err) {
      console.error("schedule failed", err);
      alert("Failed to schedule reminder: " + (err?.response?.data?.message || err?.message || "unknown"));
    }
  }

  async function handleMarkFullyPaid(conv, lead) {
    if (!window.confirm("Mark this lead as fully paid? This will create a payment entry for remaining amount (if any) and mark the conversion/lead as cleared.")) return;
    const convId = conv?._id || conv?.id;
    try {
      if (convId) {
        await AdminAPI.rawPost(`/conversions/${convId}/mark-paid`, {});
      } else {
        await AdminAPI.rawPost(`/conversions/${lead._id || lead.id}/mark-paid`, {});
      }
      alert("Marked fully paid");
      await loadConvertedLeads();
    } catch (err) {
      console.error("mark fully paid failed", err);
      alert("Failed to mark fully paid: " + (err?.response?.data?.message || err?.message || "unknown"));
    }
  }

  function sendWhatsAppReminder(lead, conv) {
    const phoneRaw = lead.phone_primary || lead.phone || "";
    const phone = phoneRaw.replace(/[^\d+]/g, "").replace(/^0+/, "");
    const paid = Number(conv?.amount_paid ?? 0) || 0;
    const total = Number(conv?.total_fee ?? conv?.total ?? 0) || 0;
    const remaining = (total && !isNaN(total)) ? Math.max(0, total - paid) : null;
    const siteUrl = window.location.origin || "";
    const leadLink = siteUrl ? `${siteUrl}/leads/${lead._id || lead.id}` : "";
    let msg = `Hello ${lead.name || ""},\nThis is a reminder for your outstanding fee${remaining != null ? ` of ${formatMoney(remaining)}` : ""}.`;
    if (conv?.course) msg += `\nCourse: ${conv.course}.`;
    if (leadLink) msg += `\nDetails: ${leadLink}`;
    msg += `\nPlease pay at your earliest convenience. Thank you.`;

    const encoded = encodeURIComponent(msg);
    let url;
    if (phone && phone.length >= 6) {
      const target = phone.replace(/\+/g, "");
      url = `https://wa.me/${target}?text=${encoded}`;
    } else {
      url = `https://web.whatsapp.com/send?text=${encoded}`;
    }
    window.open(url, "_blank");
  }

  function exportCSV() {
    const rows = [["Name","Phone","Brand","Course","Amount Paid","Total Fee","Remaining","Payment Method","Paid on","Joining date","Counsellor","Notes"]];
    for (const lead of leads) {
      const lid = lead._id || lead.id;
      const conv = convMap[lid] || {};
      const convId = conv._id || conv.id || `conv-${lid}`;
      const payments = paymentsMap[convId] || [];
      const paid = (Array.isArray(payments) && payments.length) ? payments.reduce((s,p) => s + (Number(p.amount||p.value||0)||0), 0) : Number(conv.amount_paid || 0);
      const total = Number(conv.total_fee ?? conv.total ?? 0) || "";
      const remaining = (total !== "" && paid != null) ? total - paid : "";
      rows.push([lead.name||"", lead.phone_primary||lead.phone||"", (lead.brand?.name || lead.brand) || "", conv.course||lead.course_interest||"", paid, total, remaining, conv.payment_mode||"", conv.createdAt ? dayjs(conv.createdAt).format("YYYY-MM-DD") : "", conv.joining_date ? dayjs(conv.joining_date).format("YYYY-MM-DD") : "", (conv.assigned_to && (conv.assigned_to.name || conv.assigned_to)) || "", lead.notes || ""]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `converted_leads_${dayjs().format("YYYYMMDD_HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // render
  return (
    <div style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Converted Leads</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>Full conversion & payment details with history.</div>
        </div>
        <div>
          <button onClick={exportCSV} style={secondaryBtn}>Export CSV</button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={{ padding: 40, color: "#6b7280" }}>Loading converted leads…</div>
        ) : leads.length === 0 ? (
          <div style={{ padding: 24, color: "#6b7280" }}>No converted leads found.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {leads.map((lead) => {
              const lid = lead._id || lead.id;
              const conv = convMap[lid] || (lead.conversion || {});
              const convId = conv._id || conv.id || `conv-${lid}`;
              const payments = paymentsMap[convId] || [];
              const { paid, total, remaining } = computeAmounts(conv, payments);
              const counsellor = (conv.assigned_to && (conv.assigned_to.name || conv.assigned_to)) || (lead.assigned_to && (lead.assigned_to.name || lead.assigned_to)) || user?.name || "—";

              // convertedBy — support different shapes from API
              const convertedByName =
                conv.convertedByName ||
                (conv.lead && (conv.lead.convertedBy?.name || conv.lead.convertedBy?.email)) ||
                (lead.convertedBy && (lead.convertedBy.name || lead.convertedBy.email)) ||
                null;

              return (
                <div key={lid} style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #eef2f7", boxShadow: "0 8px 24px rgba(13,20,30,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{lead.name || "—"}</div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {conv?.course && <Badge style={{ background: "#eefbf7", color: "#0f766e" }}>{conv.course}</Badge>}
                          <Badge style={{ background: "#ecfeff", color: "#0f766e" }}>Converted</Badge>
                          {remaining != null && remaining <= 0 && <Badge style={{ background: "#ecfdf5", color: "#0f766e" }}>Fee Cleared</Badge>}
                        </div>
                      </div>

                      <div style={{ color: "#6b7280", marginTop: 6 }}>{lead.phone_primary || lead.phone || "—"} • {(lead.brand && (lead.brand.name || lead.brand)) || "—"}</div>

                      {lead.notes && <div style={{ marginTop: 12, color: "#374151" }}>{lead.notes}</div>}

                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        <div style={miniCard}>
                          <div style={miniLabel}>Converted on</div>
                          <div style={miniValue}>{conv.createdAt ? dayjs(conv.createdAt).format("DD MMM YYYY") : (lead.convertedAt ? dayjs(lead.convertedAt).format("DD MMM YYYY") : "—")}</div>
                          <div style={{ marginTop: 8, color: "#6b7280" }}>By: <strong style={{ color: "#111827" }}>{convertedByName || "—"}</strong></div>
                        </div>

                        <div style={miniCard}><div style={miniLabel}>Counsellor</div><div style={miniValue}>{counsellor}</div></div>
                        <div style={miniCard}><div style={miniLabel}>Joining date</div><div style={miniValue}>{conv.joining_date ? dayjs(conv.joining_date).format("DD MMM YYYY") : "—"}</div></div>
                      </div>
                    </div>

                    <div style={{ width: 460, display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={statCard}><div style={miniLabel}>Amount Paid</div><div style={statValue}>{formatMoney(paid)}</div></div>
                        <div style={statCard}><div style={miniLabel}>Total Fee</div><div style={statValue}>{total != null ? formatMoney(total) : "—"}</div></div>
                        <div style={statCard}><div style={miniLabel}>Remaining</div><div style={statValue}>{remaining != null ? (remaining <= 0 ? "Cleared ✓" : formatMoney(remaining)) : "—"}</div></div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={miniCard}><div style={miniLabel}>Payment Method</div><div style={miniValue}>{(payments[0]?.method || payments[0]?.payment_mode || conv.payment_mode) || "—"}</div></div>
                        </div>

                        <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 8 }}>
                          <button onClick={() => openPaymentModal(conv, lead)} style={primaryBtn}>{(remaining != null && remaining > 0) ? "Update Payment" : "Add Payment"}</button>
                          <button onClick={() => sendWhatsAppReminder(lead, conv)} style={secondaryBtn}>WhatsApp Reminder</button>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openScheduleModal(conv, lead)} style={secondaryBtn}>Schedule Reminder</button>
                        <button onClick={() => handleMarkFullyPaid(conv, lead)} style={{ ...secondaryBtn, background: "#f3f4f6" }}>Mark as Fully Paid</button>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment history</div>
                        {convLoading ? (
                          <div style={{ color: "#6b7280" }}>Loading payments…</div>
                        ) : (Array.isArray(payments) && payments.length) ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {payments.map((p, idx) => <PaymentRow key={idx} p={p} />)}
                          </div>
                        ) : (
                          <div style={{ color: "#6b7280" }}>No payment history available</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {convLoading && <div style={{ color: "#6b7280" }}>Refreshing payment details…</div>}
          </div>
        )}
      </div>

      <PaymentModal
        open={payModalOpen}
        conversion={activeConv}
        lead={activeLeadForConv}
        onClose={() => { setPayModalOpen(false); setActiveConv(null); setActiveLeadForConv(null); }}
        onSubmit={handleSubmitPayment}
      />

      <ScheduleModal
        open={scheduleModalOpen}
        conversion={activeConv}
        lead={activeLeadForConv}
        onClose={() => { setScheduleModalOpen(false); setActiveConv(null); setActiveLeadForConv(null); }}
        onSubmit={handleSchedule}
      />
    </div>
  );
}
