// src/pages/Admin/AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { AdminAPI } from "../api/apiClient";
import { useAuth } from "../context/AuthContext";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

/* ---------------- styles / primitives ---------------- */
const containerPad = { padding: 22 };
const secondaryBtn = { padding: "8px 12px", background: "#fff", borderRadius: 10, border: "1px solid #e6e8eb", cursor: "pointer" };
const primaryBtn = { padding: "10px 14px", background: "#0f172a", color: "#fff", borderRadius: 10, border: "none", cursor: "pointer" };
const miniCard = { padding: 12, borderRadius: 10, background: "#fff", border: "1px solid #eef2f7" };
const kpiCard = { padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #eef2f7", minHeight: 88 };
const labelSmall = { fontSize: 12, color: "#6b7280" };
const valueLarge = { fontSize: 20, fontWeight: 800 };
const smallMuted = { fontSize: 13, color: "#6b7280" };
const dangerText = { color: "#9b111e", fontWeight: 800 };

/* ---------------- helpers to normalize responses ---------------- */
function extractLeadsFromResponse(res) {
  if (!res) return [];
  const payload = res?.data ?? res;
  if (payload?.leads && Array.isArray(payload.leads)) return payload.leads;
  if (payload?.results && Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?.data?.results && Array.isArray(payload.data.results)) return payload.data.results;
  return [];
}
function extractArrayFromApiResponse(res) {
  if (!res) return [];
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (payload?.brands && Array.isArray(payload.brands)) return payload.brands;
  if (payload?.users && Array.isArray(payload.users)) return payload.users;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

/* ---------------- tiny svg sparkline / bars ---------------- */
function Sparkline({ values = [], width = 120, height = 28 }) {
  if (!Array.isArray(values) || values.length === 0) return <div style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => `${i * step},${height - Math.round((v / max) * height)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke="#0f172a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MiniBar({ value = 0, max = 1, w = 120, h = 8 }) {
  const width = Math.round(Math.max(1, (value / Math.max(1, max)) * w));
  return (
    <svg width={w} height={h}>
      <rect x={0} y={0} width={w} height={h} rx={4} fill="#eef2f7" />
      <rect x={0} y={0} width={width} height={h} rx={4} fill="#0f172a" />
    </svg>
  );
}

/* ---------------- helper: detect actor (creator/updater) ---------------- */
/**
 * Accept any lead object and try to find who created/updated it.
 * Looks for:
 *   lead.created_by, lead.createdBy, lead.created_by_user, lead.created_by_role, lead.createdByRole, lead.createdBy.role
 *   lead.updated_by, lead.updatedBy, ...
 *
 * If user object has role === 'admin' OR isAdmin === true -> return "Admin"
 * Otherwise return user.name || user.email || id string. If not available return '—'
 */
function actorLabelFromValue(val) {
  if (!val && val !== 0) return "—";
  // val could be object or string id
  if (typeof val === "object") {
    const role = (val.role || val.userRole || val.role_name || val.roleName);
    if (role && String(role).toLowerCase() === "admin") return "Admin";
    if (val.isAdmin === true) return "Admin";
    if (val.name) return val.name;
    if (val.email) return val.email;
    // fallback to JSON-ish
    return String(val._id || val.id || (val && typeof val === "object" ? JSON.stringify(val).slice(0, 32) : String(val)));
  } else {
    // val is primitive (string id or role)
    const s = String(val || "");
    if (!s) return "—";
    // if the string itself is "admin" or contains 'admin' show Admin
    if (s.toLowerCase() === "admin" || s.toLowerCase().includes("admin")) return "Admin";
    return s;
  }
}

function getCreatorLabel(lead) {
  if (!lead) return "—";
  // possible fields
  const creator = lead.created_by ?? lead.createdBy ?? lead.created_by_user ?? lead.created_by_person ?? lead.created_by_info ?? lead.created_by_user_id ?? null;
  if (creator) return actorLabelFromValue(creator);
  // maybe role field
  const roleField = lead.created_by_role ?? lead.createdByRole ?? lead.createdByRoleName ?? lead.created_by_role_name ?? null;
  if (roleField && String(roleField).toLowerCase() === "admin") return "Admin";
  // maybe createdBy object with nested role
  const cb = lead.createdBy ?? lead.created_by ?? null;
  if (cb && typeof cb === "object") {
    return actorLabelFromValue(cb);
  }
  // fallback: maybe created_by is id but we can't map -> show id or dash
  const possibleId = lead.created_by || lead.createdById || lead.createdById || null;
  if (possibleId) return String(possibleId);
  return "—";
}

function getUpdaterLabel(lead) {
  if (!lead) return "—";
  const upd = lead.updated_by ?? lead.updatedBy ?? lead.modified_by ?? lead.modifiedBy ?? null;
  if (upd) return actorLabelFromValue(upd);
  const roleField = lead.updated_by_role ?? lead.updatedByRole ?? null;
  if (roleField && String(roleField).toLowerCase() === "admin") return "Admin";
  return "—";
}

/* ---------------- main component ---------------- */
export default function AdminDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [error, setError] = useState("");

  // data
  const [leads, setLeads] = useState([]);
  const [brands, setBrands] = useState([]);
  const [counsellors, setCounsellors] = useState([]);
  const [summary, setSummary] = useState(null); // optional server summary

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line
  }, []);

  async function refreshAll() {
    setLoading(true);
    setError("");
    setSummary(null);

    try {
      setReportsLoading(true);
      try {
        const r = await AdminAPI.getReportsSummary();
        const payload = r?.data ?? r ?? null;
        if (payload) setSummary(payload);
      } catch (err) {
        // ignore summary failure
      } finally {
        setReportsLoading(false);
      }

      // Fetch main sources for client-side calculations
      const [leadsRes, brandsRes, counsRes] = await Promise.allSettled([
        AdminAPI.getLeads({ limit: 5000 }),
        AdminAPI.getBrands(),
        AdminAPI.getCounsellors()
      ]);

      const leadsList = extractLeadsFromResponse(leadsRes.value ?? leadsRes);
      const brandsList = extractArrayFromApiResponse(brandsRes.value ?? brandsRes);
      const counsellorsList = extractArrayFromApiResponse(counsRes.value ?? counsRes);

      setLeads(leadsList);
      setBrands(brandsList);
      setCounsellors(counsellorsList);
    } catch (err) {
      console.error("refreshAll error:", err);
      setError(err?.response?.data?.message || err.message || "Failed to refresh dashboard");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- derived metrics & small analytics ---------------- */

  // helpers
  function isConverted(l) {
    if (!l) return false;
    if (l.status && String(l.status).toLowerCase() === "converted") return true;
    if (l.is_converted === true || l.converted === true) return true;
    if (l.amount_paid || l.total_fee || l.conversion || (Array.isArray(l.conversions) && l.conversions.length)) return true;
    return false;
  }

  // KPI numbers
  const totals = useMemo(() => {
    const totalLeads = leads.length;
    const converted = leads.filter(isConverted).length;
    const demoBooked = leads.filter(l => String(l.status).toLowerCase() === "demo_booked").length;
    const overdue = leads.filter(l => {
      const nf = l.next_follow_up || l.nextFollowUp || l.nextFollowUpAt;
      if (!nf) return false;
      try { return dayjs(nf).isBefore(dayjs()); } catch { return false; }
    }).length;
    const conversionRate = totalLeads ? Math.round((converted / totalLeads) * 10000) / 100 : 0;
    return { totalLeads, converted, demoBooked, overdue, conversionRate };
  }, [leads]);

  // timeline arrays for last 14 days (created leads and conversions)
  const timeline = useMemo(() => {
    const days = 14;
    const arr = [];
    for (let i = days - 1; i >= 0; i--) {
      arr.push(dayjs().subtract(i, "day").startOf("day"));
    }
    const createdCounts = arr.map(d => leads.filter(l => {
      const c = l.createdAt || l.created_at || l.created || l._created;
      return c ? dayjs(c).isSame(d, "day") : false;
    }).length);
    const convCounts = arr.map(d => leads.filter(l => {
      const conv = l.convertedAt || l.converted_at || l.converted_on || l.converted_on_date || l.converted;
      return conv ? dayjs(conv).isSame(d, "day") : false;
    }).length);
    return { days: arr.map(d => d.format("MMM D")), createdCounts, convCounts };
  }, [leads]);

  // Top brands (array)
  const brandPerf = useMemo(() => {
    const map = {};
    const sources = ["website", "referral", "walkin", "social_media", "other"];
    for (const b of brands) {
      const id = String(b._id || b.id || b);
      map[id] = { id, name: b.name || b.title || `Brand ${id}`, total: 0, converted: 0, sources: {} };
      for (const s of sources) map[id].sources[s] = 0;
    }

    // ensure an __unknown__ bucket
    map["__unknown__"] = { id: "__unknown__", name: "Unassigned/Unknown", total: 0, converted: 0, sources: { website:0, referral:0, walkin:0, social_media:0, other:0 } };

    for (const l of leads) {
      const bid = String((l.brand && (l.brand._id || l.brand.id)) || l.brand || "") || "__unknown__";
      const key = map[bid] ? bid : "__unknown__";
      const src = (l.source && String(l.source).toLowerCase()) || "other";
      map[key].sources[src] = (map[key].sources[src] || 0) + 1;
      map[key].total += 1;
      if (isConverted(l)) map[key].converted += 1;
    }
    // convert to array sorted
    const arr = Object.values(map).sort((a,b) => (b.total || 0) - (a.total || 0));
    return arr;
  }, [leads, brands]);

  // Counsellor performance (array)
  const counsellorPerf = useMemo(() => {
    const map = {};
    // create entries for known counsellors
    for (const c of counsellors) {
      const id = String(c._id || c.id || c);
      map[id] = { id, name: c.name || c.email || `Counsellor ${id}`, assigned: 0, converted: 0, convertDays: [] };
    }
    // ensure an unassigned bucket
    map["__unassigned__"] = { id: "__unassigned__", name: "Unassigned", assigned: 0, converted: 0, convertDays: [] };

    for (const l of leads) {
      const a = l.assigned_to;
      const aid = typeof a === "object" ? String(a._id || a.id || "") : String(a || "");
      const key = map[aid] ? aid : "__unassigned__";
      // defensive: ensure object exists
      if (!map[key]) map[key] = { id: key, name: key === "__unassigned__" ? "Unassigned" : `User ${key}`, assigned: 0, converted: 0, convertDays: [] };

      map[key].assigned += 1;
      if (isConverted(l)) {
        map[key].converted += 1;
        const created = l.createdAt || l.created_at || l.created || l._created || null;
        const convAt = l.convertedAt || l.converted_at || l.converted_on || l.converted_on_date || null;
        if (created && convAt) {
          const days = Math.max(0, dayjs(convAt).diff(dayjs(created), "day"));
          map[key].convertDays.push(days);
        }
      }
    }

    const arr = Object.values(map).map(c => {
      const avg = (Array.isArray(c.convertDays) && c.convertDays.length) ? Math.round(c.convertDays.reduce((s,x)=>s+x,0) / c.convertDays.length) : null;
      const conversionPct = c.assigned ? Math.round((c.converted / c.assigned) * 10000) / 100 : 0;
      return {
        id: c.id,
        name: c.name,
        assigned: c.assigned || 0,
        converted: c.converted || 0,
        convertDays: c.convertDays || [],
        avgConvertDays: avg,
        conversionPct
      };
    }).sort((a,b) => (b.assigned||0) - (a.assigned||0));
    return arr;
  }, [leads, counsellors]);

  // next actionable items: upcoming follow-ups (next 7 days), overdue top 40
  const upcomingFollowUps = useMemo(() => {
    const now = dayjs();
    const limit = 20;
    const arr = leads.filter(l => {
      const nf = l.next_follow_up || l.nextFollowUp || l.nextFollowUpAt;
      if (!nf) return false;
      try {
        return dayjs(nf).isAfter(now) && dayjs(nf).isBefore(now.add(7, "day"));
      } catch { return false; }
    }).sort((a,b) => dayjs(a.next_follow_up || a.nextFollowUp).valueOf() - dayjs(b.next_follow_up || b.nextFollowUp).valueOf());
    return arr.slice(0, limit);
  }, [leads]);

  const overdue = useMemo(() => {
    const arr = leads.filter(l => {
      const nf = l.next_follow_up || l.nextFollowUp || l.nextFollowUpAt;
      if (!nf) return false;
      try { return dayjs(nf).isBefore(dayjs()); } catch { return false; }
    }).sort((a,b) => dayjs(a.next_follow_up || a.nextFollowUp).valueOf() - dayjs(b.next_follow_up || b.nextFollowUp).valueOf());
    return arr.slice(0, 40);
  }, [leads]);

  const upcomingDemos = useMemo(() => {
    const arr = leads.filter(l => {
      const demo = l.next_demo || l.demo_date || (l.demos && Array.isArray(l.demos) && l.demos[0] && l.demos[0].date);
      if (!demo) return false;
      try { return dayjs(demo).isAfter(dayjs()) && dayjs(demo).isBefore(dayjs().add(14,"day")); } catch { return false; }
    }).slice(0, 20);
    return arr;
  }, [leads]);

  /* ---------------- Render ---------------- */
  return (
    <div style={containerPad}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            Live overview — what happened, what's happening, and next actions.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refreshAll} style={secondaryBtn}>Refresh</button>
          <button onClick={() => {
            // export top details similar to prior export
            const rows = [["Type","Name","Leads","Converted","Conversion %","AvgConvertDays"]];
            for (const c of counsellorPerf.slice(0,10)) rows.push(["Counsellor", c.name, c.assigned||0, c.converted||0, (c.conversionPct||0) + "%", c.avgConvertDays||""]);
            for (const b of brandPerf.slice(0,10)) rows.push(["Brand", b.name, b.total||0, b.converted||0, (b.total ? Math.round((b.converted/(b.total||1))*100) : 0) + "%", ""]);
            const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv"}));
            a.download = `admin_dash_export_${dayjs().format("YYYYMMDD_HHmm")}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }} style={secondaryBtn}>Export</button>
        </div>
      </div>

      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

      {/* KPI strip */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <div style={{ ...kpiCard }}>
          <div style={labelSmall}>All leads</div>
          <div style={valueLarge}>{summary?.totalLeads ?? totals.totalLeads}</div>
          <div style={smallMuted}>{summary?.leadsToday ? `${summary.leadsToday} today` : `${leads.filter(l => dayjs(l.createdAt || l.created_at).isSame(dayjs(), 'day')).length} today`}</div>
          <div style={{ marginTop: 8 }}><Sparkline values={timeline.createdCounts} /></div>
        </div>

        <div style={{ ...kpiCard }}>
          <div style={labelSmall}>Converted</div>
          <div style={valueLarge}>{summary?.converted ?? totals.converted}</div>
          <div style={smallMuted}>Conversion rate: {summary?.conversionRate ?? totals.conversionRate}%</div>
          <div style={{ marginTop: 8 }}><Sparkline values={timeline.convCounts} /></div>
        </div>

        <div style={{ ...kpiCard }}>
          <div style={labelSmall}>Demo Booked</div>
          <div style={valueLarge}>{summary?.demoBooked ?? totals.demoBooked}</div>
          <div style={smallMuted}>Overdue: {summary?.overdue ?? totals.overdue}</div>
        </div>

        <div style={{ ...kpiCard }}>
          <div style={labelSmall}>Overdue</div>
          <div style={valueLarge}>{summary?.overdue ?? totals.overdue}</div>
          <div style={smallMuted}>Next follow-up in the past</div>
        </div>

        <div style={{ ...kpiCard }}>
          <div style={labelSmall}>Actionable</div>
          <div style={valueLarge}>{upcomingFollowUps.length}</div>
          <div style={smallMuted}>Upcoming follow-ups (7d)</div>
        </div>
      </div>

      {/* Trends + Top brands + Counsellor leaderboard */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 420px", gap: 12 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Trends (14 days)</h3>
            <div style={smallMuted}>Shows lead inflow & conversions</div>
          </div>

          <div style={{ marginTop: 12, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #eef2f7" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div><strong>Leads created</strong><div style={smallMuted}>{timeline.days[0]} → {timeline.days[timeline.days.length-1]}</div></div>
                  <div style={{ textAlign: "right" }}>{timeline.createdCounts.reduce((s,x)=>s+x,0)} total</div>
                </div>
                <Sparkline values={timeline.createdCounts} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div><strong>Conversions</strong><div style={smallMuted}>Last 14 days</div></div>
                  <div style={{ textAlign: "right" }}>{timeline.convCounts.reduce((s,x)=>s+x,0)} total</div>
                </div>
                <Sparkline values={timeline.convCounts} />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {/* quick insights */}
              <div style={miniCard}>
                <div style={labelSmall}>This week leads</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{timeline.createdCounts.slice(-7).reduce((s,x)=>s+x,0)}</div>
                <div style={smallMuted}>Compared to previous week: {/* compute % change */}</div>
              </div>
              <div style={miniCard}>
                <div style={labelSmall}>This week conversions</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{timeline.convCounts.slice(-7).reduce((s,x)=>s+x,0)}</div>
                <div style={smallMuted}>Trend vs prev week</div>
              </div>
              <div style={miniCard}>
                <div style={labelSmall}>Conversion rate</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{totals.conversionRate}%</div>
                <div style={smallMuted}>All time (visible data)</div>
              </div>
            </div>
          </div>

          {/* Top brands */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Top brands</h3>
              <div style={smallMuted}>Where leads are coming from</div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {brandPerf.slice(0,8).map((b, idx) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #eef2f7" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>{b.name}</div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{b.total} leads</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <MiniBar value={b.total} max={brandPerf[0]?.total || 1} />
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(b.sources).map(([s, n]) => <div key={s} style={{ fontSize: 12, color: "#6b7280" }}><strong style={{ color: "#111827" }}>{n}</strong> {s.replace("_"," ")}</div>)}
                      </div>
                    </div>
                  </div>

                  <div style={{ width: 120, textAlign: "right" }}>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Converted</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{b.converted || 0}</div>
                    <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>{b.total ? Math.round((b.converted/(b.total||1))*100) + "%" : "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Counsellor leaderboards + overdue */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={miniCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>Top counsellors</strong><div style={smallMuted}>By assigned leads & conversion</div></div>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {counsellorPerf.slice(0,8).map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #eef2f7" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      { (typeof c.assigned === "number" ? c.assigned : 0) } assigned • { (typeof c.converted === "number" ? c.converted : 0) } converted
                      { (c.avgConvertDays != null) ? ` • avg ${c.avgConvertDays}d` : "" }
                    </div>
                  </div>
                  <div style={{ width: 120 }}>
                    <MiniBar value={c.assigned} max={counsellorPerf[0]?.assigned || 1} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={miniCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>Overdue leads</strong><div style={smallMuted}>Needs attention</div></div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{overdue.length} shown</div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {overdue.slice(0,8).map(l => (
                <div key={l._id || l.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #fff4f4" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{l.name || "—"}</div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      {(l.phone_primary || l.phone || "—")} • {(l.brand && (l.brand.name || l.brand)) || ""}
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                        <strong>Added by:</strong> {getCreatorLabel(l)} {getUpdaterLabel(l) && getUpdaterLabel(l) !== "—" ? `• Updated by: ${getUpdaterLabel(l)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={dangerText}>{dayjs(l.next_follow_up || l.nextFollowUp).format("DD MMM, YYYY HH:mm")}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>{dayjs(l.next_follow_up || l.nextFollowUp).fromNow()}</div>
                  </div>
                </div>
              ))}
              {overdue.length === 0 && <div style={{ color: "#6b7280" }}>No overdue leads</div>}
            </div>
          </div>

          <div style={miniCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>Upcoming follow-ups (7d)</strong><div style={smallMuted}>Prioritize these</div></div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{upcomingFollowUps.length}</div>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {upcomingFollowUps.slice(0,8).map(l => (
                <div key={l._id || l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #eef2f7" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{l.name}</div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      {(l.phone_primary || l.phone || "—")} • {(l.brand && (l.brand.name || l.brand)) || ""}
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                        <strong>Added by:</strong> {getCreatorLabel(l)} {getUpdaterLabel(l) && getUpdaterLabel(l) !== "—" ? `• Updated by: ${getUpdaterLabel(l)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{dayjs(l.next_follow_up || l.nextFollowUp).format("DD MMM, HH:mm")}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>{dayjs(l.next_follow_up || l.nextFollowUp).fromNow()}</div>
                  </div>
                </div>
              ))}
              {upcomingFollowUps.length === 0 && <div style={{ color: "#6b7280" }}>No upcoming follow-ups</div>}
            </div>
          </div>
        </div>
      </div>

      {/* raw server summary (if available) */}
      {summary && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "6px 0" }}>Raw summary (server)</h3>
          <pre style={{ background: "#0f172a", color: "#fff", padding: 12, borderRadius: 8, overflowX: "auto" }}>{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}

      {(loading || reportsLoading) && <div style={{ color: "#6b7280", marginTop: 12 }}>Loading dashboard data…</div>}
    </div>
  );
}
