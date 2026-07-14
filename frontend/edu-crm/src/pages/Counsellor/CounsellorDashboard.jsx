// src/pages/Counsellor/CounsellorDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AdminAPI } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import { Bar } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

/**
 * CounsellorDashboard — Enhanced with Chart.js, click handlers and date-range filter
 *
 * Notes:
 * - Charts are interactive: click a brand/source bar to filter leads.
 * - Date-range applies to createdAt for metric calculations and funnel.
 * - Call sheet shows next_follow_up entries in the selected date range (or today by default).
 * - Uses AdminAPI.getLeads({ counsellor, page, limit }) to fetch up to `limit` leads for dashboard.
 * - If dataset grows, prefer server-side aggregation endpoints.
 */

export default function CounsellorDashboard() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState([]);

  // date range state — defaults to last 30 days
  const [startDate, setStartDate] = useState(dayjs().subtract(29, "day").format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState(dayjs().format("YYYY-MM-DD"));

  // filters from interactions
  const [brandFilter, setBrandFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  // filtered leads for right panel
  const [filteredLeads, setFilteredLeads] = useState([]);

  // chart refs
  const brandChartRef = useRef(null);
  const sourceChartRef = useRef(null);
  const funnelChartRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    loadAssignedLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadAssignedLeads() {
    setLoading(true);
    setError("");
    try {
      const res = await AdminAPI.getLeads({ counsellor: userId, page: 1, limit: 5000 });
      const arr = res?.leads ?? (res?.data?.results ?? []);
      setLeads(Array.isArray(arr) ? arr : []);
      clearFilters();
    } catch (err) {
      console.error("loadAssignedLeads failed", err);
      setError(err?.response?.data?.message || err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  // clear interactive filters
  function clearFilters() {
    setBrandFilter("");
    setSourceFilter("");
    setFilteredLeads([]);
  }

  // compute metrics inside date range (createdAt filter)
  const metrics = useMemo(() => {
    // parse date-range as inclusive daytime range (UTC local)
    const s = startDate ? dayjs(startDate).startOf("day") : null;
    const e = endDate ? dayjs(endDate).endOf("day") : null;

    let totalAssigned = 0;
    let todayFollowUps = 0;
    let overdue = 0;
    let demoBookedToday = 0;
    const callSheet = [];

    const brandCounts = {};
    const sourceCounts = {};
    let freshLeads = 0;
    let demoLeads = 0;
    let convertedLeads = 0;

    const now = dayjs();

    for (const l of leads) {
      // filter by createdAt within selected range if provided
      const created = l.createdAt ? dayjs(l.createdAt) : (l.createdAt === undefined ? null : dayjs(l.createdAt));
      if (s && e) {
        if (!created || !created.isValid() || !created.isBetween(s, e, null, "[]")) {
          continue;
        }
      }

      totalAssigned++;

      const status = (l.status || "").toString();
      const brandName = (l.brand && (l.brand.name || l.brand)) || "Unknown";
      const src = l.source || "Unknown";

      brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      // funnel counts (by status)
      if (status === "new") freshLeads++;
      if (status === "demo_booked") demoLeads++;
      if (status === "converted") convertedLeads++;

      // follow-ups: consider next_follow_up falling inside [s,e] if custom, else today
      const nextRaw = l.next_follow_up || l.nextFollowUp || null;
      const nf = nextRaw ? dayjs(nextRaw) : null;
      const nfValid = nf && nf.isValid && nf.isValid();

      // Determine followup range usage:
      // If user has selected an explicit date-range, count follow-ups inside that range.
      // Otherwise (default), count for today.
      const followupStart = s ?? now.startOf("day");
      const followupEnd = e ?? now.endOf("day");

      if (nfValid) {
        if (nf.isBetween(followupStart, followupEnd, null, "[]")) {
          todayFollowUps++;
          callSheet.push({
            id: l._id || l.id,
            name: l.name,
            phone: l.phone_primary || l.phone || "",
            time: nf.format("YYYY-MM-DD HH:mm"),
            brand: brandName,
            source: src,
            status,
          });
          if (status === "demo_booked") {
            // Demo booked during followup window
            demoBookedToday++;
          }
        } else if (nf.isBefore(dayjs())) {
          // only count overdue relative to now regardless of date-range
          overdue++;
        }
      }
    }

    // conversion percentages
    const freshToDemoPct = freshLeads > 0 ? Math.round((demoLeads / freshLeads) * 100) : 0;
    const demoToConvertedPct = demoLeads > 0 ? Math.round((convertedLeads / demoLeads) * 100) : 0;

    return {
      totalAssigned,
      todayFollowUps,
      overdue,
      demoBookedToday,
      callSheet,
      brandCounts,
      sourceCounts,
      freshLeads,
      demoLeads,
      convertedLeads,
      freshToDemoPct,
      demoToConvertedPct,
    };
  }, [leads, startDate, endDate]);

  // build brand chart data + options
  const brandChartData = useMemo(() => {
    const entries = Object.entries(metrics.brandCounts || {});
    entries.sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    return {
      labels,
      datasets: [
        {
          label: "Leads",
          data,
          backgroundColor: generatePalette(data.length, "brand"),
          borderRadius: 6,
          barThickness: 28,
        },
      ],
    };
  }, [metrics.brandCounts]);

  const brandOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true, titleFont: { weight: 700 } },
      title: { display: false },
    },
    scales: {
      x: { ticks: { color: "#374151" }, grid: { display: false } },
      y: { ticks: { color: "#374151", beginAtZero: true, precision: 0 }, grid: { color: "#f3f4f6" } },
    },
    onClick: (evt, elements) => {
      // handled below via ref for more robust behavior
    },
  }), []);

  // source chart (horizontal bar)
  const sourceChartData = useMemo(() => {
    const entries = Object.entries(metrics.sourceCounts || {});
    entries.sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    return {
      labels,
      datasets: [
        {
          label: "Leads",
          data,
          backgroundColor: generatePalette(data.length, "source"),
          borderRadius: 6,
          barThickness: 18,
        },
      ],
    };
  }, [metrics.sourceCounts]);

  const sourceOptions = useMemo(() => ({
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { ticks: { color: "#374151", beginAtZero: true }, grid: { color: "#f3f4f6" } },
      y: { ticks: { color: "#374151" }, grid: { display: false } },
    },
  }), []);

  // funnel chart (horizontal small)
  const funnelChartData = useMemo(() => {
    const labels = ["Fresh", "Demo Booked", "Converted"];
    const data = [metrics.freshLeads || 0, metrics.demoLeads || 0, metrics.convertedLeads || 0];
    return {
      labels,
      datasets: [
        {
          label: "Funnel",
          data,
          backgroundColor: ["#06b6d4", "#f59e0b", "#10b981"],
          borderRadius: 6,
        },
      ],
    };
  }, [metrics.freshLeads, metrics.demoLeads, metrics.convertedLeads]);

  const funnelOptions = useMemo(() => ({
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { beginAtZero: true, ticks: { color: "#374151", precision: 0 }, grid: { color: "#f3f4f6" } },
      y: { ticks: { color: "#374151" }, grid: { display: false } }
    }
  }), []);

  // chart click handlers using refs (more robust)
  function handleBrandClick(evt) {
    const chart = brandChartRef.current;
    if (!chart) return;
    const elements = chart.getElementsAtEventForMode(evt.nativeEvent, "nearest", { intersect: true }, true);
    if (!elements.length) return;
    const idx = elements[0].index;
    const label = brandChartData.labels[idx];
    applyBrandFilter(label);
  }

  function handleSourceClick(evt) {
    const chart = sourceChartRef.current;
    if (!chart) return;
    const elements = chart.getElementsAtEventForMode(evt.nativeEvent, "nearest", { intersect: true }, true);
    if (!elements.length) return;
    const idx = elements[0].index;
    const label = sourceChartData.labels[idx];
    applySourceFilter(label);
  }

  function applyBrandFilter(brandLabel) {
    setBrandFilter(brandLabel);
    setSourceFilter("");
    // filtered leads: include those created within the date range (matching metrics selection)
    const s = startDate ? dayjs(startDate).startOf("day") : null;
    const e = endDate ? dayjs(endDate).endOf("day") : null;

    const fl = leads.filter(l => {
      const created = l.createdAt ? dayjs(l.createdAt) : null;
      if (s && e) {
        if (!created || !created.isValid() || !created.isBetween(s, e, null, "[]")) return false;
      }
      const name = (l.brand && (l.brand.name || l.brand)) || "Unknown";
      return name === brandLabel;
    }).slice(0, 200); // cap for UI
    setFilteredLeads(fl);
  }

  function applySourceFilter(sourceLabel) {
    setSourceFilter(sourceLabel);
    setBrandFilter("");
    const s = startDate ? dayjs(startDate).startOf("day") : null;
    const e = endDate ? dayjs(endDate).endOf("day") : null;

    const fl = leads.filter(l => {
      const created = l.createdAt ? dayjs(l.createdAt) : null;
      if (s && e) {
        if (!created || !created.isValid() || !created.isBetween(s, e, null, "[]")) return false;
      }
      const src = l.source || "Unknown";
      return src === sourceLabel;
    }).slice(0, 200);
    setFilteredLeads(fl);
  }

  // when date range changes, clear current interactive filters
  useEffect(() => {
    setFilteredLeads([]);
    setBrandFilter("");
    setSourceFilter("");
  }, [startDate, endDate]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Counsellor Dashboard</h1>
          <div style={styles.sub}>Welcome{user?.name ? `, ${user.name}` : ""} — overview & performance.</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={styles.dateRange}>
            <label style={styles.smallLabel}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
            <label style={{ ...styles.smallLabel, marginLeft: 8 }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
          </div>

          <button onClick={loadAssignedLeads} style={styles.primaryBtn}>Refresh</button>
          <button onClick={() => { setStartDate(dayjs().subtract(29, "day").format("YYYY-MM-DD")); setEndDate(dayjs().format("YYYY-MM-DD")); }} style={styles.ghostBtn}>Last 30d</button>
          <button onClick={clearFilters} style={styles.ghostBtn}>Clear filters</button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 420px", gap: 16 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <MetricCard title="Assigned leads" value={metrics.totalAssigned} accent="linear-gradient(135deg,#7c3aed,#06b6d4)" />
            <MetricCard title="Follow-ups (range)" value={metrics.todayFollowUps} accent="linear-gradient(135deg,#0ea5e9,#60a5fa)" />
            <MetricCard title="Overdue" value={metrics.overdue} accent="linear-gradient(135deg,#ef4444,#fb7185)" />
            <MetricCard title="Demos (range)" value={metrics.demoBookedToday} accent="linear-gradient(135deg,#f59e0b,#f97316)" />
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 360px", gap: 12 }}>
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={styles.cardTitle}>Brand distribution</h3>
                <div style={styles.badge}>{brandChartData.labels?.length ?? 0} brands</div>
              </div>

              <div style={{ height: 340 }}>
                {brandChartData.labels?.length ? (
                  <Bar
                    ref={brandChartRef}
                    data={brandChartData}
                    options={{
                      ...brandOptions,
                      onClick: (evt) => handleBrandClick(evt),
                      plugins: { ...brandOptions.plugins, tooltip: { ...brandOptions.plugins.tooltip, callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.y ?? ctx.parsed}` } } }
                    }}
                  />
                ) : <div style={styles.empty}>No brand data in range</div>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <small style={{ color: "#6b7280" }}>Click a bar to filter leads by brand.</small>
                </div>
                {brandFilter && <div style={styles.filterPill}>Filtering: <strong style={{ marginLeft: 6 }}>{brandFilter}</strong></div>}
              </div>
            </div>

            <div style={styles.rightColumn}>
              <div style={styles.cardSmall}>
                <h4 style={styles.cardTitleSmall}>Source distribution</h4>
                <div style={{ height: 220 }}>
                  {sourceChartData.labels?.length ? (
                    <Bar
                      ref={sourceChartRef}
                      data={sourceChartData}
                      options={{ ...sourceOptions, onClick: (evt) => handleSourceClick(evt) }}
                    />
                  ) : <div style={styles.empty}>No source data</div>}
                </div>
              </div>

              <div style={{ height: 180, marginTop: 12, ...styles.cardSmall }}>
                <h4 style={styles.cardTitleSmall}>Conversion funnel</h4>
                <div style={{ height: 110 }}>
                  <Bar ref={funnelChartRef} data={funnelChartData} options={funnelOptions} />
                </div>
                <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
                  Fresh → Demo: <strong>{metrics.freshToDemoPct}%</strong> • Demo → Converted: <strong>{metrics.demoToConvertedPct}%</strong>
                </div>
              </div>
            </div>
          </div>

          {/* filtered leads list */}
          <div style={{ marginTop: 14, ...styles.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={styles.cardTitle}>{brandFilter ? `Leads — ${brandFilter}` : sourceFilter ? `Leads — ${sourceFilter}` : "Leads (sample)"}</h3>
              <div style={{ color: "#6b7280", fontSize: 13 }}>{filteredLeads.length ? `${filteredLeads.length} shown` : `${leads.length} total fetched (sample)`}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 13 }}>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Brand</th>
                    <th style={styles.th}>Source</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredLeads.length ? filteredLeads : leads.slice(0, 50)).map(l => {
                    const nf = l.next_follow_up ? dayjs(l.next_follow_up).format("YYYY-MM-DD HH:mm") : "-";
                    const brandName = (l.brand && (l.brand.name || l.brand)) || "-";
                    return (
                      <tr key={l._id || l.id} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={styles.td}>{l.name}</td>
                        <td style={styles.td}>{l.phone_primary || l.phone || "-"}</td>
                        <td style={styles.td}>{brandName}</td>
                        <td style={styles.td}>{l.source || "-"}</td>
                        <td style={styles.td}>{l.status || "-"}</td>
                        <td style={styles.td}>{nf}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* right column: call sheet and quick stats */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Call sheet — range</h3>
            {metrics.callSheet.length === 0 ? (
              <div style={styles.empty}>No follow-ups in selected range</div>
            ) : (
              <ul style={{ paddingLeft: 12 }}>
                {metrics.callSheet.slice(0, 60).map(c => (
                  <li key={c.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700 }}>{c.name} <span style={{ color: "#6b7280", fontSize: 13 }}>• {c.brand}</span></div>
                    <div style={{ color: "#374151" }}>{c.phone} — {c.time}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{c.source} • {c.status}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Quick summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SummaryRow label="Fresh" value={metrics.freshLeads} />
              <SummaryRow label="Demo Booked" value={metrics.demoLeads} />
              <SummaryRow label="Converted" value={metrics.convertedLeads} />
              <SummaryRow label="Fresh → Demo" value={`${metrics.freshToDemoPct}%`} />
              <SummaryRow label="Demo → Conv" value={`${metrics.demoToConvertedPct}%`} />
              <SummaryRow label="Range" value={`${startDate} → ${endDate}`} />
            </div>
          </div>

          <div style={{ ...styles.card, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
            <button onClick={() => { /* navigate to counsellor leads page filter? */ alert("Open Leads page filtered by current filters (you can wire navigation)."); }} style={styles.primaryBtn}>Open Leads</button>
            <button onClick={() => { setStartDate(dayjs().startOf("month").format("YYYY-MM-DD")); setEndDate(dayjs().format("YYYY-MM-DD")); }} style={styles.ghostBtn}>This month</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- small presentational components ---------- */

function MetricCard({ title, value, accent }) {
  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.98), #fff)",
      borderRadius: 12,
      padding: 16,
      boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: 8,
      border: "1px solid rgba(15,23,42,0.03)"
    }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: accent || "linear-gradient(135deg,#7c3aed,#06b6d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18
        }}>{value}</div>
        <div style={{ color: "#111827", fontWeight: 700, fontSize: 20 }}>{value}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#fff", borderRadius: 8, border: "1px solid #eef2f7" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/* ---------- helpers & styles ---------- */

function generatePalette(n, kind = "brand") {
  // refined palette for a more professional look
  const palette = [
    "#0f172a", "#1f2937", "#2563eb", "#06b6d4",
    "#06b6d4", "#10b981", "#f97316", "#ef4444",
    "#7c3aed", "#ec4899", "#f59e0b", "#64748b"
  ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(palette[i % palette.length]);
  return out;
}

const styles = {
  page: { padding: 20, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sub: { color: "#6b7280", marginTop: 6 },
  dateRange: { display: "flex", gap: 8, alignItems: "center", background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #eef2f7" },
  dateInput: { padding: 8, borderRadius: 8, border: "1px solid #e6e8eb", background: "#fff" },
  smallLabel: { color: "#6b7280", fontSize: 12 },
  primaryBtn: { padding: "8px 12px", borderRadius: 8, background: "#0f172a", color: "#fff", border: "none", cursor: "pointer" },
  ghostBtn: { padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e6e8eb", cursor: "pointer" },
  card: { background: "#fff", padding: 14, borderRadius: 12, boxShadow: "0 6px 18px rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.03)" },
  cardSmall: { background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 6px 18px rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.03)" },
  cardTitle: { margin: 0, fontSize: 16, color: "#111827" },
  cardTitleSmall: { margin: 0, fontSize: 14, color: "#111827" },
  rightColumn: { display: "flex", flexDirection: "column", gap: 12 },
  empty: { padding: 28, color: "#6b7280", textAlign: "center" },
  th: { padding: 10, fontSize: 13, color: "#6b7280" },
  td: { padding: 10, fontSize: 14, color: "#111827" },
  badge: { background: "linear-gradient(90deg,#eef2ff,#f0fdf4)", color: "#334155", padding: "6px 8px", borderRadius: 999, fontSize: 12 },
  filterPill: { background: "#eef2ff", padding: "6px 8px", borderRadius: 8, color: "#0f172a", fontSize: 13 }
};
