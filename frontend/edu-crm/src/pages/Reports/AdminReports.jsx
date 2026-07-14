// src/pages/Reports/AdminReports.jsx
import React, { useEffect, useState, useRef } from "react";
import { AdminAPI } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";

/**
 * Admin Reports — uses only existing routes:
 *  - AdminAPI.getLeads({ limit: N })  -> fetch leads (client-side filter/aggregate)
 *  - AdminAPI.getBrands()
 *  - AdminAPI.getCounsellors()
 *  - AdminAPI.getReportsSummary() (optional, will be used if available)
 *
 * Client-side computed:
 *  - Leads over time (by createdAt)
 *  - Brand performance (counts, conversions)
 *  - Counsellor leaderboard (assigned leads, conversions)
 *
 * Note: we fetch a large page of leads (limit 10000) to compute analytics client-side.
 * If you have seriously large datasets, paginate or implement server-side reports later.
 */

export default function AdminReports() {
  const { user } = useAuth();
  const [from, setFrom] = useState(dayjs().subtract(29, "day").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [brandFilter, setBrandFilter] = useState("");
  const [counsellorFilter, setCounsellorFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState("");

  const [brandsList, setBrandsList] = useState([]);
  const [counsellorsList, setCounsellorsList] = useState([]);

  // Source data
  const [leadsRaw, setLeadsRaw] = useState([]); // all leads fetched
  const [summary, setSummary] = useState(null);

  // computed views
  const [leadsOverTime, setLeadsOverTime] = useState([]);
  const [brandPerf, setBrandPerf] = useState([]);
  const [counsellorPerf, setCounsellorPerf] = useState([]);

  const fetchRef = useRef(null);

  useEffect(() => {
    loadMeta();
    loadData(); // initial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // recompute whenever filters or raw leads change
    computeReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsRaw, from, to, brandFilter, counsellorFilter]);

  async function loadMeta() {
    setMetaLoading(true);
    try {
      const [bRes, cRes] = await Promise.allSettled([
        AdminAPI.getBrands?.(),
        AdminAPI.getCounsellors?.(),
      ]);
      const bPayload = bRes.status === "fulfilled" ? (bRes.value?.data ?? bRes.value ?? []) : [];
      const cPayload = cRes.status === "fulfilled" ? (cRes.value?.data ?? cRes.value ?? []) : [];

      // normalize arrays (common shapes)
      const brands = Array.isArray(bPayload) ? bPayload : (bPayload.brands || bPayload.data || []);
      const counsellors = Array.isArray(cPayload) ? cPayload : (cPayload.users || cPayload.data || []);
      setBrandsList(Array.isArray(brands) ? brands : []);
      setCounsellorsList(Array.isArray(counsellors) ? counsellors : []);
    } catch (err) {
      console.warn("loadMeta failed", err);
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      // fetch many leads (client-side reporting). Adjust limit as needed.
      // mapLeadsParams in your client supports limit; here we ask for a very large single page.
      const res = await AdminAPI.getLeads({ limit: 10000 });
      // AdminAPI.getLeads returns normalized object { leads, total, page, limit, raw }
      const rows = res?.leads ?? (res?.data?.leads ?? res?.data ?? []);
      setLeadsRaw(Array.isArray(rows) ? rows : []);

      // try server summary if available, else compute below in computeReports
      try {
        const s = await AdminAPI.getReportsSummary?.();
        if (s) {
          const p = s?.data ?? s;
          setSummary({
            totalLeads: p.totalLeads ?? p.total ?? null,
            conversions: p.conversions ?? p.converted ?? null,
            conversionRate: p.conversionRate ?? p.conversion ?? null,
            demoBooked: p.demoBooked ?? p.demos ?? null,
          });
        }
      } catch (e) {
        // ignore; we'll compute summary client-side
      }
    } catch (err) {
      console.error("loadData failed", err);
      setError(err?.response?.data?.message || err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  function computeReports() {
    const fromDt = dayjs(from).startOf("day");
    const toDt = dayjs(to).endOf("day");

    // filter leads by date range and optional brand/counsellor filters
    const filtered = leadsRaw.filter((l) => {
      const created = l.createdAt || l.created_at || l.created || l._created;
      if (!created) return false;
      const dt = dayjs(created);
      if (!dt.isValid()) return false;
      if (!dt.isBetween ? !(dt.isAfter(toDt) || dt.isBefore(fromDt)) : !(dt.isAfter(toDt) || dt.isBefore(fromDt))) {
        // continue — we'll use dayjs comparisons below
      }
      if (dt.isBefore(fromDt) || dt.isAfter(toDt)) return false;
      if (brandFilter) {
        const bid = (l.brand && (l.brand._id || l.brand.id || String(l.brand))) || String(l.brand || "");
        if (String(bid) !== String(brandFilter)) return false;
      }
      if (counsellorFilter) {
        const aid = (l.assigned_to && (l.assigned_to._id || l.assigned_to.id || String(l.assigned_to))) || String(l.assigned_to || "");
        if (String(aid) !== String(counsellorFilter)) return false;
      }
      return true;
    });

    // summary (client computed if server summary not available)
    const totalLeads = filtered.length;
    const converted = filtered.filter(isConverted).length;
    const demoBooked = filtered.filter(l => String(l.status).toLowerCase() === "demo_booked").length;
    const conversionRate = totalLeads ? Math.round((converted / totalLeads) * 10000) / 100 : 0;
    if (!summary) {
      setSummary({ totalLeads, conversions: converted, conversionRate, demoBooked });
    } else {
      // keep server summary if present; but still update counts for UI responsiveness
      setSummary(prev => ({ ...prev, totalLeads: prev.totalLeads ?? totalLeads, conversions: prev.conversions ?? converted, conversionRate: prev.conversionRate ?? conversionRate, demoBooked: prev.demoBooked ?? demoBooked }));
    }

    // leads over time: group by day between from..to
    const days = [];
    let cur = fromDt.clone();
    while (cur.isBefore(toDt) || cur.isSame(toDt, "day")) {
      days.push(cur.format("YYYY-MM-DD"));
      cur = cur.add(1, "day");
    }
    const counts = {};
    for (const d of days) counts[d] = { leads: 0, conversions: 0 };
    for (const l of filtered) {
      const c = l.createdAt || l.created_at || l.created || l._created;
      const day = c ? dayjs(c).format("YYYY-MM-DD") : null;
      if (!day || counts[day] === undefined) continue;
      counts[day].leads += 1;
      if (isConverted(l)) counts[day].conversions += 1;
    }
    setLeadsOverTime(days.map(d => ({ date: d, leads: counts[d].leads, conversions: counts[d].conversions })));

    // brand performance
    const brandMap = {};
    for (const l of filtered) {
      const b = l.brand;
      const key = b && (typeof b === "object" ? (b._id || b.id || JSON.stringify(b)) : String(b)) || "__unknown__";
      const name = b && (typeof b === "object" ? (b.name || String(b._id || b.id)) : String(b)) || "Unknown";
      if (!brandMap[key]) brandMap[key] = { id: key, name, total: 0, converted: 0, sources: {} };
      brandMap[key].total++;
      if (isConverted(l)) brandMap[key].converted++;
      const src = (l.source || "other").toString();
      brandMap[key].sources[src] = (brandMap[key].sources[src] || 0) + 1;
    }
    const brandArr = Object.values(brandMap).sort((a, b) => (b.total || 0) - (a.total || 0));
    setBrandPerf(brandArr);

    // counsellor performance
    const cMap = {};
    for (const c of counsellorsList) {
      const id = String(c._id || c.id || c);
      cMap[id] = { id, name: c.name || c.email || `Counsellor ${id}`, assigned: 0, converted: 0, convertDays: [] };
    }
    // unassigned bucket
    cMap["__unassigned__"] = cMap["__unassigned__"] || { id: "__unassigned__", name: "Unassigned", assigned: 0, converted: 0, convertDays: [] };

    for (const l of filtered) {
      const a = l.assigned_to;
      const aid = typeof a === "object" ? String(a._id || a.id || "") : String(a || "");
      const key = cMap[aid] ? aid : "__unassigned__";
      cMap[key].assigned++;
      if (isConverted(l)) {
        cMap[key].converted++;
        const created = l.createdAt || l.created_at || l.created || l._created || null;
        const convAt = l.convertedAt || l.converted_at || l.converted_on || l.converted_on_date || null;
        if (created && convAt) {
          const daysDiff = Math.max(0, dayjs(convAt).diff(dayjs(created), "day"));
          cMap[key].convertDays.push(daysDiff);
        }
      }
    }
    const cArr = Object.values(cMap).map(c => ({
      id: c.id,
      name: c.name,
      assigned: c.assigned,
      converted: c.converted,
      avgConvertDays: c.convertDays.length ? Math.round(c.convertDays.reduce((s, x) => s + x, 0) / c.convertDays.length) : null,
      conversionPct: c.assigned ? Math.round((c.converted / c.assigned) * 10000) / 100 : 0
    })).sort((a, b) => (b.assigned || 0) - (a.assigned || 0));
    setCounsellorPerf(cArr);
  }

  function isConverted(l) {
    if (!l) return false;
    if (l.status && String(l.status).toLowerCase() === "converted") return true;
    if (l.is_converted === true || l.converted === true) return true;
    if (l.amount_paid || l.total_fee || l.conversion || (Array.isArray(l.conversions) && l.conversions.length)) return true;
    return false;
  }

  async function exportLeadsCsv() {
    try {
      // we already have leadsRaw; apply the same client-side date/brand/counsellor filters
      const fromDt = dayjs(from).startOf("day");
      const toDt = dayjs(to).endOf("day");
      const rows = leadsRaw.filter(l => {
        const created = l.createdAt || l.created_at || l.created || l._created;
        if (!created) return false;
        const dt = dayjs(created);
        if (!dt.isValid()) return false;
        if (dt.isBefore(fromDt) || dt.isAfter(toDt)) return false;
        if (brandFilter) {
          const bid = (l.brand && (l.brand._id || l.brand.id || String(l.brand))) || String(l.brand || "");
          if (String(bid) !== String(brandFilter)) return false;
        }
        if (counsellorFilter) {
          const aid = (l.assigned_to && (l.assigned_to._id || l.assigned_to.id || String(l.assigned_to))) || String(l.assigned_to || "");
          if (String(aid) !== String(counsellorFilter)) return false;
        }
        return true;
      });

      if (!rows.length) return alert("No leads to export for the selected range/filters.");
      const columns = ["_id", "name", "phone_primary", "email", "brand", "assigned_to", "status", "course_interest", "source", "next_follow_up", "createdAt"];
      const csv = toCsv(rows, columns);
      downloadBlob(csv, `leads_${from}_${to}.csv`);
    } catch (err) {
      console.error("exportLeadsCsv failed", err);
      alert("Export failed: " + (err?.message || "unknown"));
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <div style={{ color: "#6b7280" }}>Analytics & performance for leads, brands and counsellors (client-side computed)</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadData} style={buttonStyle} disabled={loading}>Refresh</button>
          <button onClick={exportLeadsCsv} style={buttonStyle} disabled={loading}>Export Leads CSV</button>
        </div>
      </header>

      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={labelStyle}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label style={labelStyle}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />

          <label style={labelStyle}>Brand</label>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
            <option value="">All</option>
            {brandsList.map(b => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
          </select>

          <label style={labelStyle}>Counsellor</label>
          <select value={counsellorFilter} onChange={(e) => setCounsellorFilter(e.target.value)}>
            <option value="">All</option>
            {counsellorsList.map(c => <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          <div>
            <div style={{ display: "flex", gap: 12 }}>
              <StatCard label="Total leads" value={summary?.totalLeads ?? 0} />
              <StatCard label="Conversions" value={summary?.conversions ?? 0} />
              <StatCard label="Conversion %" value={`${Number(summary?.conversionRate ?? 0).toFixed(1)}%`} />
            </div>

            <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 10 }}>
              <h3 style={{ marginTop: 0 }}>Leads over time</h3>
              <div style={{ maxWidth: "100%", overflowX: "auto" }}>
                <table style={{ width: 800, borderCollapse: "collapse" }}>
                  <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Leads</th><th style={thStyle}>Conversions</th></tr></thead>
                  <tbody>
                    {leadsOverTime.map((s, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{s.date}</td>
                        <td style={tdStyle}>{s.leads}</td>
                        <td style={tdStyle}>{s.conversions}</td>
                      </tr>
                    ))}
                    {leadsOverTime.length === 0 && <tr><td colSpan={3} style={{ padding: 8, color: "#6b7280" }}>No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside>
            <div style={{ padding: 12, background: "#fff", borderRadius: 10 }}>
              <h3 style={{ marginTop: 0 }}>Brand comparison</h3>
              {brandPerf.length === 0 && <div style={{ color: "#6b7280" }}>No data</div>}
              {brandPerf.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <div>{b.name}</div>
                  <div>{b.total}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 10 }}>
              <h3 style={{ marginTop: 0 }}>Counsellor leaderboard</h3>
              {counsellorPerf.length === 0 && <div style={{ color: "#6b7280" }}>No data</div>}
              {counsellorPerf.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <div>{c.name}</div>
                  <div>{c.assigned}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
      {(loading || metaLoading) && <div style={{ marginTop: 12, color: "#6b7280" }}>Loading...</div>}
    </div>
  );
}

/* helpers and small UI bits */

function StatCard({ label, value }) {
  return (
    <div style={{ padding: 12, background: "#fff", borderRadius: 10, minWidth: 140 }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function toCsv(rows = [], columns = []) {
  if (!Array.isArray(rows)) return "";
  if (!columns.length) columns = rows.length ? Object.keys(rows[0]) : [];
  const escapeCell = v => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(",");
  const body = rows.map(r => columns.map(c => {
    // support nested brand/assigned objects
    const val = r[c] ?? (c === "brand" && r.brand ? (r.brand.name || JSON.stringify(r.brand)) : (c === "assigned_to" && r.assigned_to ? (r.assigned_to.name || JSON.stringify(r.assigned_to)) : ""));
    return escapeCell(val);
  }).join(",")).join("\n");
  return `${header}\n${body}`;
}

function downloadBlob(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* styles */
const buttonStyle = { padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #e6e8eb", cursor: "pointer" };
const labelStyle = { marginLeft: 6, marginRight: 6, color: "#111827", fontWeight: 700 };
const thStyle = { textAlign: "left", padding: 8, borderBottom: "1px solid #eef2f7", color: "#6b7280" };
const tdStyle = { padding: 6, borderBottom: "1px solid #f7f7fb" };
