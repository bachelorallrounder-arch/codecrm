// src/pages/Counsellor/CounsellorLeads.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminAPI } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

// Modals (extracted)
import {
  AttemptModal,
  RemarkModal,
  DemoModal,
  ConvertModal,
} from "./LeadModals";

// CSS (extracted)
import "./counsellorLeads.css";

const SOURCES = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "walkin", label: "Walk-in" },
  { value: "social_media", label: "Social Media" },
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "Whatsapp" },
  { value: "other", label: "Other" },
];

export default function CounsellorLeads() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = (user?.id || user?._id || "") + "";
  const isCounsellor = user?.role === "counsellor";
  const isAdmin = user?.role === "admin";

  const [leads, setLeads] = useState([]);
  const [brands, setBrands] = useState([]);
  const [counsellors, setCounsellors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState({ brand: "", source: "", status: "" });
  const [quick, setQuick] = useState("");
  const [sortBy, setSortBy] = useState("nextFollowUp"); // default: next follow-up
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const [showSlide, setShowSlide] = useState(false);
  const [editing, setEditing] = useState(null); // full lead object (from server or list)
  const [busy, setBusy] = useState(false);

  // form holds editable fields shown in form inputs
  const emptyForm = {
    name: "",
    phone_primary: "",
    phone_secondary: "",
    email: "",
    brand: "",
    source: "",
    course_interest: "",
    notes: "",
    next_follow_up: "",
    assigned_to: userId || "",
  };
  const [form, setForm] = useState(emptyForm);

  // details: attempts / remarks / demos / conversion
  const [editingAttempts, setEditingAttempts] = useState([]);
  const [editingRemarks, setEditingRemarks] = useState([]);
  const [editingDemos, setEditingDemos] = useState([]);
  const [editingConversion, setEditingConversion] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // quick modal states
  const [activeLead, setActiveLead] = useState(null);
  const [showAttemptModal, setShowAttemptModal] = useState(false);
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  useEffect(() => {
    loadMeta();
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadLeads(), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, quick, sortBy, page]);

  // helper to display user info robustly
  function displayUserName(u) {
    if (!u) return "—";
    if (typeof u === "string") return u;
    if (u.name) return u.name;
    if (u.fullName) return u.fullName;
    if (u.email) return u.email;
    if (u._id) return String(u._id);
    if (u.id) return String(u.id);
    return "—";
  }

  async function loadMeta() {
    setMetaLoading(true);
    try {
      try {
        const res = await AdminAPI.getBrands();
        const payload = res?.data ?? res ?? [];
        const arr =
          payload?.brands ||
          payload?.data ||
          (Array.isArray(payload) ? payload : []);
        setBrands(Array.isArray(arr) ? arr : []);
      } catch (err) {
        // fallback: use assigned brands from user
        const assigned = Array.isArray(user?.assignedBrands)
          ? user.assignedBrands.map((b) =>
            typeof b === "string"
              ? { _id: b, name: `Brand ${b}` }
              : {
                _id: b._id || b.id || b,
                name: b.name || `Brand ${b._id || b.id || ""}`,
              }
          )
          : [];
        setBrands(assigned);
      }

      if (isAdmin) {
        try {
          const r = await AdminAPI.getCounsellors();
          const p = r?.data ?? r ?? [];
          const arr =
            p?.users || p?.data || (Array.isArray(p) ? p : []);
          setCounsellors(Array.isArray(arr) ? arr : []);
        } catch {
          setCounsellors([]);
        }
      } else {
        setCounsellors([]);
      }
    } finally {
      setMetaLoading(false);
    }
  }

  function sortQuery(key) {
    if (key === "nextFollowUp") return "next_follow_up";
    if (key === "createdAt") return "-createdAt";
    return "next_follow_up";
  }

  async function loadLeads() {
    setLoading(true);
    setError("");
    try {
      const params = {
        search: q || undefined,
        brand: filter.brand || undefined,
        source: filter.source || undefined,
        status: filter.status || undefined,
        quickFilter: quick || undefined,
        sortBy: sortQuery(sortBy),
        page,
        limit,
      };

      const res = await AdminAPI.getLeads(params);
      if (res && Array.isArray(res.leads)) {
        setLeads(res.leads);
        setTotal(res.total ?? res.leads.length);
      } else {
        const payload = res?.data ?? res;
        const arr =
          payload?.results ||
          payload?.leads ||
          payload?.data ||
          payload?.docs ||
          (Array.isArray(payload) ? payload : []);
        setLeads(Array.isArray(arr) ? arr : []);
        setTotal(
          payload?.total ??
          payload?.count ??
          (Array.isArray(arr) ? arr.length : 0)
        );
      }
    } catch (err) {
      console.error("Leads load failed:", err);
      setError(
        err?.response?.data?.message ||
        err.message ||
        "Could not load leads"
      );
    } finally {
      setLoading(false);
    }
  }

  /* ---------- helpers ---------- */
  function assignedToCurrentUser(lead) {
    const a = lead?.assigned_to;
    if (!a) return false;
    const assignedId =
      typeof a === "object" ? a._id || a.id || "" : String(a || "");
    return String(assignedId) === String(userId);
  }

  function isConverted(lead) {
    if (!lead) return false;
    if (
      lead.status &&
      String(lead.status).toLowerCase() === "converted"
    )
      return true;
    if (lead.is_converted === true) return true;
    if (lead.converted === true) return true;
    return false;
  }

  function getCount(lead, kind) {
    const countNames = [
      `${kind}_count`,
      `${kind}Count`,
      `${kind}_counts`,
      `${kind}Counts`,
    ];
    for (const n of countNames) {
      if (typeof lead?.[n] === "number") return lead[n];
    }
    const arr =
      lead?.[kind] ||
      lead?.[`${kind}s`] ||
      lead?.[`${kind}_list`];
    if (Array.isArray(arr)) return arr.length;
    return 0;
  }

  function formatNextFollowUp(nf) {
    if (!nf)
      return {
        label: "No follow-up",
        human: "No follow-up",
        color: "muted",
      };
    const dt = dayjs(nf);
    if (!dt.isValid())
      return { label: "Invalid", human: nf, color: "muted" };

    const todayStart = dayjs().startOf("day");
    const todayEnd = dayjs().endOf("day");

    if (dt.isBefore(dayjs())) {
      return {
        label: dt.format("DD MMM, YYYY HH:mm"),
        human: `${dt.fromNow()}`,
        color: "overdue",
      };
    }
    if (dt.isAfter(todayStart) && dt.isBefore(todayEnd)) {
      return {
        label: dt.format("DD MMM, YYYY HH:mm"),
        human: `Today • ${dt.format("HH:mm")}`,
        color: "today",
      };
    }
    return {
      label: dt.format("DD MMM, YYYY HH:mm"),
      human: dt.format("DD MMM, HH:mm"),
      color: "future",
    };
  }

  /* ---------- open create / open edit ---------- */

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, assigned_to: isCounsellor ? userId : "" });
    setEditingAttempts([]);
    setEditingRemarks([]);
    setEditingDemos([]);
    setEditingConversion(null);
    setShowSlide(true);
  }

  async function openEdit(listLead) {
    if (!listLead) return;

    // show slide immediately
    setShowSlide(true);
    setDetailsLoading(true);

    // 1) Prefill from list item so fields are never blank
    const baseLead = listLead || {};
    setEditing(baseLead);
    setForm({
      name: baseLead.name || "",
      phone_primary: baseLead.phone_primary || baseLead.phone || baseLead.mobile || "",
      phone_secondary: baseLead.phone_secondary || "",
      email: baseLead.email || baseLead.Email || "",
      brand:
        (baseLead.brand &&
          (baseLead.brand._id ||
            baseLead.brand.id ||
            baseLead.brand)) ||
        baseLead.brand ||
        "",
      source: baseLead.source || baseLead.Source || "",
      course_interest: baseLead.course_interest?._id || baseLead.course || "",
      notes: baseLead.notes || "",
      next_follow_up: baseLead.next_follow_up
        ? dayjs(baseLead.next_follow_up).format("YYYY-MM-DDTHH:mm")
        : "",
      assigned_to:
        (baseLead.assigned_to &&
          (baseLead.assigned_to._id ||
            baseLead.assigned_to.id ||
            baseLead.assigned_to)) ||
        userId ||
        "",
    });

    setEditingAttempts([]);
    setEditingRemarks([]);
    setEditingDemos([]);
    setEditingConversion(null);

    const leadId = baseLead._id || baseLead.id;
    if (!leadId) {
      setDetailsLoading(false);
      return;
    }

    // 2) Fetch freshest lead & related details
    try {
      const [
        leadRes,
        attemptsRes,
        remarksRes,
        demosRes,
        convRes,
      ] = await Promise.allSettled([
        AdminAPI.getLead ? AdminAPI.getLead(leadId) : null,
        AdminAPI.getAttempts ? AdminAPI.getAttempts(leadId) : null,
        AdminAPI.getRemarks ? AdminAPI.getRemarks(leadId) : null,
        AdminAPI.getDemos ? AdminAPI.getDemos(leadId) : null,
        AdminAPI.convertedLead
          ? AdminAPI.convertedLead(leadId)
          : null,
      ]);

      // --- merge API lead with list lead ---
      let apiLead = null;
      if (leadRes.status === "fulfilled" && leadRes.value) {
        const raw = leadRes.value?.data ?? leadRes.value ?? {};
        apiLead =
          raw.lead ||
          raw.data ||
          raw.result ||
          raw;
      }

      const mergedLead = { ...(baseLead || {}), ...(apiLead || {}) };
      setEditing(mergedLead);

      setForm({
        name: mergedLead.name || "",
        phone_primary:
          mergedLead.phone_primary || mergedLead.phone || "",
        phone_secondary: mergedLead.phone_secondary || "",
        email: mergedLead.email || mergedLead.Email || "",
        brand:
          (mergedLead.brand &&
            (mergedLead.brand._id ||
              mergedLead.brand.id ||
              mergedLead.brand)) ||
          mergedLead.brand ||
          "",
        source: mergedLead.source || mergedLead.Source || "",
        course_interest: mergedLead.course_interest?._id || mergedLead.course_interest || "",
        notes: mergedLead.notes || "",
        next_follow_up: mergedLead.next_follow_up
          ? dayjs(mergedLead.next_follow_up).format(
            "YYYY-MM-DDTHH:mm"
          )
          : "",
        assigned_to:
          (mergedLead.assigned_to &&
            (mergedLead.assigned_to._id ||
              mergedLead.assigned_to.id ||
              mergedLead.assigned_to)) ||
          userId ||
          "",
      });

      // attempts
      if (attemptsRes.status === "fulfilled" && attemptsRes.value) {
        const attPayload =
          attemptsRes.value?.data ?? attemptsRes.value ?? [];
        const arr =
          attPayload.results ||
          attPayload.data ||
          attPayload ||
          [];
        setEditingAttempts(Array.isArray(arr) ? arr : []);
      } else {
        setEditingAttempts([]);
      }

      // remarks
      if (remarksRes.status === "fulfilled" && remarksRes.value) {
        const rPayload =
          remarksRes.value?.data ?? remarksRes.value ?? [];
        const arr =
          rPayload.results || rPayload.data || rPayload || [];
        setEditingRemarks(Array.isArray(arr) ? arr : []);
      } else {
        setEditingRemarks([]);
      }

      // demos
      if (demosRes.status === "fulfilled" && demosRes.value) {
        const dPayload =
          demosRes.value?.data ?? demosRes.value ?? [];
        const arr =
          dPayload.results || dPayload.data || dPayload || [];
        setEditingDemos(Array.isArray(arr) ? arr : []);
      } else {
        setEditingDemos([]);
      }

      // conversion
      if (convRes.status === "fulfilled" && convRes.value) {
        const cPayload =
          convRes.value?.data ?? convRes.value ?? null;
        const conv =
          cPayload?.conversion ||
          cPayload?.data ||
          cPayload ||
          null;
        setEditingConversion(conv || null);
      } else {
        setEditingConversion(null);
      }
    } catch (err) {
      console.error("openEdit error:", err);
    } finally {
      setDetailsLoading(false);
    }
  }

  /* ---------- CRUD interactions ---------- */

  async function handleSave(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      if (!form.name?.trim()) throw new Error("Name required");
      if (!form.phone_primary?.trim())
        throw new Error("Primary phone required");
      if (!form.brand) throw new Error("Brand required");

      const body = {
        name: form.name,
        phone_primary: form.phone_primary,
        phone_secondary: form.phone_secondary || undefined,
        email: form.email || undefined,
        brand: form.brand,
        source: form.source || undefined,
        course_interest: form.course_interest || undefined,
        notes: form.notes || undefined,
        next_follow_up: form.next_follow_up
          ? new Date(form.next_follow_up).toISOString()
          : undefined,
        assigned_to: form.assigned_to || undefined,
      };

      if (editing && (editing._id || editing.id)) {
        await AdminAPI.updateLead(editing._id || editing.id, body);
      } else {
        await AdminAPI.createLead(body);
      }
      await loadLeads();
      setShowSlide(false);
    } catch (err) {
      alert(
        err?.response?.data?.message ||
        err.message ||
        "Save failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(l) {
    if (!window.confirm(`Delete lead "${l.name}" ?`)) return;
    try {
      await AdminAPI.deleteLead(l._id || l.id);
      await loadLeads();
    } catch (err) {
      alert(
        "Delete failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  async function addAttempt(leadId, payload) {
    try {
      await AdminAPI.addAttempt(leadId, payload);
      // refresh details & list
      await openEdit({ _id: leadId, id: leadId });
      await loadLeads();
    } catch (err) {
      alert(
        "Add attempt failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  async function addRemark(leadId, text, next_follow_up) {
    try {
      await AdminAPI.addRemark(leadId, { text, next_follow_up });
      await openEdit({ _id: leadId, id: leadId });
      await loadLeads();
    } catch (err) {
      alert(
        "Add remark failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  async function bookDemo(leadId, payload) {
    try {
      if (AdminAPI.bookDemo) await AdminAPI.bookDemo(leadId, payload);
      else
        await AdminAPI.rawPost(`/leads/${leadId}/demos`, payload);
      await openEdit({ _id: leadId, id: leadId });
      await loadLeads();
    } catch (err) {
      alert(
        "Book demo failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  async function convertLead(leadId, payload) {
    try {
      await AdminAPI.convertLead(leadId, payload);
      await openEdit({ _id: leadId, id: leadId });
      await loadLeads();
    } catch (err) {
      alert(
        "Convert failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  async function quickAssignSelf(l) {
    try {
      if (assignedToCurrentUser(l)) return;
      let nf = l.next_follow_up
        ? new Date(l.next_follow_up).toISOString()
        : undefined;
      if (!nf) {
        const ans = prompt(
          "Enter next follow-up (YYYY-MM-DDTHH:mm) — required to assign:",
          dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm")
        );
        if (!ans) return;
        nf = new Date(ans).toISOString();
      }
      await AdminAPI.updateLead(l._id || l.id, {
        assigned_to: userId,
        next_follow_up: nf,
      });
      await loadLeads();
    } catch (err) {
      alert(
        "Assign failed: " +
        (err?.response?.data?.message || err.message)
      );
    }
  }

  const totalPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil((total || leads.length || 0) / limit)
      ),
    [total, leads, limit]
  );

  /* ---------- small UI components (kept inline) ---------- */
  const Card = ({ children, style }) => (
    <div className="cl-card" style={style}>
      {children}
    </div>
  );

  const StatusBadge = ({ status }) => {
    const map = {
      new: ["#eef2ff", "#1e40af"],
      attempting: ["#fff7ed", "#92400e"],
      demo_booked: ["#ecfccb", "#365314"],
      converted: ["#ecfeff", "#0f766e"],
      not_interested: ["#fff1f2", "#9f1239"],
      cold: ["#f8fafc", "#111827"],
    };
    const [bg, color] = map[status] || ["#f3f4f6", "#374151"];
    return (
      <span
        className="cl-status-badge"
        style={{
          background: bg,
          color,
          padding: "6px 8px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          textTransform: "capitalize",
        }}
      >
        {status || "—"}
      </span>
    );
  };

  const ConvertedPill = () => (
    <span className="cl-converted-pill">Converted</span>
  );

  const CountBadge = ({ count }) => {
    if (!count || Number(count) <= 0) return null;
    return <span className="cl-count-badge">{count}</span>;
  };

  const NextFollowPill = ({ iso }) => {
    const info = formatNextFollowUp(iso);
    const baseClass = "cl-next-pill";
    let cls = baseClass;
    if (info.color === "overdue") cls += " overdue";
    if (info.color === "today") cls += " today";
    if (info.color === "future") cls += " future";
    if (info.color === "muted") cls += " muted";

    return (
      <div title={info.label} aria-label={`Next follow-up ${info.label}`} className={cls}>
        {info.human}
      </div>
    );
  };

  /* ---------- Render ---------- */
  return (
    <div className="cl-page">
      <div className="cl-header">
        <div>
          <h2 className="cl-title">Leads</h2>
          <div className="cl-sub">
            Manage your assigned leads, follow-ups and conversions — click a lead to see full details and history.
          </div>
        </div>

        <div className="cl-actions">
          <input
            placeholder="Search name / phone / notes..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="cl-input cl-search"
          />
          <button
            type="button"
            onClick={() => {
              setFilter({ brand: "", source: "", status: "" });
              setQuick("");
              setQ("");
              setPage(1);
            }}
            className="btn-secondary"
          >
            Clear
          </button>
          <button type="button" onClick={loadLeads} className="btn-secondary">
            Refresh
          </button>
          <button type="button" onClick={openCreate} className="btn-primary">
            + Add Lead
          </button>
          <button
            type="button"
            onClick={() => navigate("/counsellor/converted")}
            className="btn-secondary"
          >
            Converted leads
          </button>
        </div>
      </div>

      <section className="cl-grid">
        <aside className="cl-sidebar">
          <Card>
            <div className="cl-filters-header">
              <h4 style={{ margin: 0 }}>Filters</h4>
              <div className="cl-quick-label">Quick</div>
            </div>

            <div className="cl-filters-body">
              <label className="cl-label">Brand</label>
              <select
                value={filter.brand}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, brand: e.target.value }));
                  setPage(1);
                }}
                className="cl-select"
              >
                <option value="">All brands</option>
                {brands.length === 0 && (
                  <option value="" disabled>
                    {metaLoading ? "Loading brands..." : "No brands"}
                  </option>
                )}
                {brands.map((b) => (
                  <option key={b._id || b.id} value={b._id || b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <label className="cl-label">Source</label>
              <select
                value={filter.source}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, source: e.target.value }));
                  setPage(1);
                }}
                className="cl-select"
              >
                <option value="">All sources</option>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <label className="cl-label">Status</label>
              <select
                value={filter.status}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, status: e.target.value }));
                  setPage(1);
                }}
                className="cl-select"
              >
                <option value="">All statuses</option>
                <option value="new">New</option>
                <option value="attempting">Attempting</option>
                <option value="demo_booked">Demo Booked</option>
                <option value="converted">Converted</option>
                <option value="not_interested">Not Interested</option>
                <option value="cold">Cold</option>
              </select>

              <div className="cl-quick-buttons">
                {["Hot", "Overdue", "Fresh", "Demo Booked"].map((qx) => (
                  <button
                    key={qx}
                    type="button"
                    onClick={() =>
                      setQuick((cur) => (cur === qx ? "" : qx))
                    }
                    className={quick === qx ? "btn-quick active" : "btn-quick"}
                  >
                    {qx}
                  </button>
                ))}
              </div>

              <label className="cl-label">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="cl-select"
              >
                <option value="nextFollowUp">
                  Next follow-up (default)
                </option>
                <option value="createdAt">Created Date (newest)</option>
              </select>
            </div>
          </Card>
        </aside>

        <main className="cl-main">
          <Card>
            {loading ? (
              <div className="cl-loading">Loading leads…</div>
            ) : error ? (
              <div className="cl-error">{error}</div>
            ) : (
              <>
                <div className="cl-list-header">
                  <div className="cl-count">
                    {total || leads.length
                      ? `${total || leads.length} leads`
                      : "No leads found"}
                  </div>
                  <div className="cl-pagination">
                    <div className="cl-page-info">Page {page} / {totalPages}</div>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.max(1, p - 1))
                      }
                      disabled={page <= 1}
                      className="btn-small"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                      className="btn-small"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="cl-list">
                  {leads.length === 0 && (
                    <div className="cl-no-results">No leads match this filter.</div>
                  )}

                  {leads.map((l) => {
                    const nf = l.next_follow_up
                      ? dayjs(l.next_follow_up).format(
                        "YYYY-MM-DDTHH:mm"
                      )
                      : null;
                    const brandName =
                      (l.brand && (l.brand.name || l.brand)) ||
                      l.brand ||
                      "-";
                    const assignedIsMe = assignedToCurrentUser(l);
                    const alreadyConverted = isConverted(l);

                    // counts
                    const attemptsCount =
                      getCount(l, "attempt") || getCount(l, "attempts");
                    const remarksCount =
                      getCount(l, "remark") || getCount(l, "remarks");
                    const demosCount =
                      getCount(l, "demo") || getCount(l, "demos");

                    return (
                      <div
                        key={l._id || l.id}
                        role="button"
                        onClick={() => openEdit(l)}
                        title="Click to open lead"
                        className="cl-list-item"
                      >
                        <div>
                          <div className="cl-list-row-top">
                            <div>
                              <div className="cl-lead-name">{l.name}</div>
                              <div className="cl-lead-phone">
                                {l.phone_primary ||
                                  l.phone ||
                                  "-"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className="cl-brand">{brandName}</div>
                              <div className="cl-status-area">
                                {String(l.status).toLowerCase() !==
                                  "converted" && (
                                    <StatusBadge status={l.status} />
                                  )}
                                {alreadyConverted && <ConvertedPill />}
                              </div>
                            </div>
                          </div>
                          <div className="cl-course-source">
                            {l.course_interest?.name || l.course_interest || "—"} • Source: {l.source || "—"}
                          </div>
                        </div>

                        <div className="cl-list-follow">
                          <div className="cl-next-wrapper">
                            <NextFollowPill iso={nf} />
                          </div>

                          <div className="cl-action-row">
                            <div className="cl-action-with-count">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveLead(l);
                                  setShowAttemptModal(true);
                                }}
                                className="btn-action"
                              >
                                Attempt
                              </button>
                              <CountBadge count={attemptsCount} />
                            </div>

                            <div className="cl-action-with-count">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveLead(l);
                                  setShowRemarkModal(true);
                                }}
                                className="btn-action"
                              >
                                Remark
                              </button>
                              <CountBadge count={remarksCount} />
                            </div>

                            <div className="cl-action-with-count">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveLead(l);
                                  setShowDemoModal(true);
                                }}
                                className="btn-action"
                              >
                                Demo
                              </button>
                              <CountBadge count={demosCount} />
                            </div>
                          </div>
                        </div>

                        <div className="cl-list-actions">
                          {!alreadyConverted && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveLead(l);
                                setShowConvertModal(true);
                              }}
                              className="btn-primary-small"
                            >
                              Convert
                            </button>
                          )}

                          {!assignedIsMe && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                quickAssignSelf(l);
                              }}
                              className="btn-ghost"
                            >
                              Assign to me
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(l);
                            }}
                            className="btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </main>
      </section>

      {/* Slide-over: form + details */}
      {showSlide && (
        <div className="cl-slide-backdrop">
          <div className="cl-slide">
            {/* Header showing personal info */}
            <div className="cl-slide-header">
              <div>
                <div className="cl-slide-title">
                  {editing?.name || form.name || "Edit lead —"}
                </div>
                <div className="cl-slide-sub">
                  <div>{editing?.phone_primary || form.phone_primary || "—"}</div>
                  <div>{editing?.email || form.email || "—"}</div>
                  <div className="cl-slide-brand">{(editing?.brand && (editing.brand.name || editing.brand)) || form.brand || "—"}</div>
                  <div>
                    {editing && isConverted(editing) ? (
                      <ConvertedPill />
                    ) : editing?.status ? (
                      <StatusBadge status={editing.status} />
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSlide(false);
                    setEditing(null);
                  }}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="cl-form">
              <div className="cl-form-grid">
                <div>
                  <label className="cl-label">Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, name: e.target.value }))
                    }
                    className="cl-input"
                  />

                  <div className="cl-two-row">
                    <div style={{ flex: 1 }}>
                      <label className="cl-label">Primary phone</label>
                      <input
                        required
                        value={form.phone_primary}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, phone_primary: e.target.value }))
                        }
                        className="cl-input"
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label className="cl-label">Alternative Number</label>
                      <input
                        value={form.phone_secondary}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, phone_secondary: e.target.value }))
                        }
                        className="cl-input"
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label className="cl-label">Email</label>
                      <input
                        value={form.email}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, email: e.target.value }))
                        }
                        className="cl-input"
                      />
                    </div>
                  </div>

                  <label className="cl-label">Source</label>
                  <select
                    value={form.source}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, source: e.target.value }))
                    }
                    className="cl-input"
                  >
                    <option value="">Select source</option>
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <label className="cl-label">Course interest</label>
                  <input
                    value={form.course_interest}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, course_interest: e.target.value }))
                    }
                    className="cl-input"
                  />

                  <label className="cl-label">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, notes: e.target.value }))
                    }
                    rows={6}
                    className="cl-input cl-textarea"
                  />
                </div>

                <div>
                  <label className="cl-label">Brand</label>
                  <select
                    required
                    value={form.brand}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, brand: e.target.value }))
                    }
                    className="cl-input"
                  >
                    <option value="">
                      {metaLoading ? "Loading brands..." : "Select brand"}
                    </option>
                    {brands.map((b) => (
                      <option key={b._id || b.id} value={b._id || b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <label className="cl-label">Assign to</label>
                  <select
                    value={form.assigned_to}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, assigned_to: e.target.value }))
                    }
                    className="cl-input"
                  >
                    <option value="">
                      {isCounsellor ? "Unassigned / me" : "Unassigned"}
                    </option>
                    {counsellors.map((c) => (
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <label className="cl-label">Next follow-up</label>
                  <input
                    type="datetime-local"
                    value={form.next_follow_up}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, next_follow_up: e.target.value }))
                    }
                    className="cl-input"
                  />

                  <div className="cl-form-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSlide(false);
                        setEditing(null);
                      }}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn-primary"
                    >
                      {busy
                        ? "Saving..."
                        : editing
                          ? "Update"
                          : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Details area (conversion / attempts / remarks / demos) */}
            {editing && (
              <div className="cl-details">
                <h4 style={{ marginBottom: 8 }}>Details</h4>

                <div className="cl-conversion-row">
                  <Card>
                    <div className="cl-muted">Conversion</div>
                    {detailsLoading ? (
                      <div style={{ padding: 16 }}>Loading…</div>
                    ) : editingConversion ? (
                      <div>
                        <div className="cl-conversion-course">
                          {editingConversion.course ||
                            editingConversion.course_name ||
                            "—"}
                        </div>
                        <div className="cl-conversion-grid">
                          <div className="cl-small-box">
                            <div className="cl-muted small">Amount Paid</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.amount_paid ?? "—"}
                            </div>
                          </div>
                          <div className="cl-small-box">
                            <div className="cl-muted small">Total Fee</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.total_fee ?? "—"}
                            </div>
                          </div>
                          <div className="cl-small-box">
                            <div className="cl-muted small">Remaining</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.total_fee != null &&
                                editingConversion.amount_paid != null
                                ? Number(editingConversion.total_fee) -
                                Number(editingConversion.amount_paid)
                                : "—"}
                            </div>
                          </div>
                          <div className="cl-small-box">
                            <div className="cl-muted small">Payment Mode</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.payment_mode || "—"}
                            </div>
                          </div>
                          <div className="cl-small-box">
                            <div className="cl-muted small">Paid on</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.createdAt
                                ? dayjs(editingConversion.createdAt).format("DD MMM, YYYY")
                                : editingConversion.paid_on
                                  ? dayjs(editingConversion.paid_on).format("DD MMM, YYYY")
                                  : "—"}
                              {editingConversion.lead?.convertedBy?.name
                                || editingConversion.convertedBy?.name
                                || editingConversion.convertedBy
                                || "-"}
                              {" "}
                              <span>
                                {displayUserName(
                                  editingConversion.convertedBy ||
                                  editingConversion.converted_by ||
                                  editingConversion.createdBy ||
                                  editingConversion.created_by ||
                                  editingConversion.createdByUser ||
                                  editingConversion.user
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="cl-small-box">
                            <div className="cl-muted small">Joining</div>
                            <div style={{ fontWeight: 700 }}>
                              {editingConversion.joining_date
                                ? dayjs(editingConversion.joining_date).format("DD MMM, YYYY")
                                : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="cl-muted" style={{ padding: 12 }}>Not converted</div>
                    )}
                  </Card>
                </div>

                <div className="cl-details-grid">
                  <Card>
                    <div className="cl-section-title">Attempts ({editingAttempts.length})</div>
                    {editingAttempts.length === 0 ? (
                      <div className="cl-muted">No attempts</div>
                    ) : (
                      <div className="cl-list-compact">
                        {editingAttempts.map((a) => (
                          <div key={a._id || a.id || Math.random()} className="cl-mini-card">
                            <div className="cl-mini-title">{a.result || a.outcome || "—"}</div>
                            <div className="cl-mini-body">{a.remark || a.note || a.comment || "—"}</div>
                            <div className="cl-mini-meta">
                              {a.createdAt
                                ? dayjs(a.createdAt).format("DD MMM, YYYY • HH:mm")
                                : a.date
                                  ? dayjs(a.date).format("DD MMM, YYYY • HH:mm")
                                  : ""}
                              {" "}
                              <h4>Made By:{" "}
                                {displayUserName(
                                  a.createdBy || ""
                                )}
                              </h4>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="cl-section-title">Remarks ({editingRemarks.length})</div>
                    {editingRemarks.length === 0 ? (
                      <div className="cl-muted">No remarks</div>
                    ) : (
                      <div className="cl-list-compact">
                        {editingRemarks.map((r) => (
                          <div key={r._id || r.id || Math.random()} className="cl-mini-card-alt">
                            <div className="cl-mini-body">{r.text || r.note || "—"}</div>
                            <div className="cl-mini-meta">{r.next_follow_up ? `Next: ${dayjs(r.next_follow_up).format("DD MMM, YYYY • HH:mm")}` : ""}</div>
                            <div className="cl-mini-meta">
                              {r.createdAt ? dayjs(r.createdAt).format("DD MMM, YYYY • HH:mm") : ""}
                              {" "}
                              <h4>{" "} Made By: {displayUserName(r.createdBy || "")}</h4>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="cl-section-title">Demos ({editingDemos.length})</div>
                    {editingDemos.length === 0 ? (
                      <div className="cl-muted">No demos</div>
                    ) : (
                      <div className="cl-list-compact">
                        {editingDemos.map((d) => (
                          <div key={d._id || d.id || Math.random()} className="cl-mini-card-demo">
                            <div className="cl-mini-title">{d.date ? dayjs(d.date).format("DD MMM, YYYY") : d.scheduled_date || "—"}</div>
                            <div className="cl-mini-body">{d.time || d.scheduled_time || ""} {d.trainer ? `• ${d.trainer}` : ""}</div>
                            <div className="cl-mini-meta">
                              {d.createdAt ? dayjs(d.createdAt).format("DD MMM, YYYY • HH:mm") : ""}
                              {" "}
                              <h4>Made By: {displayUserName(d.createdBy || d.created_by || d.user || d.bookedBy || d.booked_by)}</h4>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="cl-section-title">Other</div>
                    <div className="cl-muted">
                      <div>
                        <strong>Added by:</strong>{" "}
                        {editing?.createdBy?.name ||
                          (editing?.createdBy
                            ? displayUserName(editing.createdBy)
                            : "—")}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Created:</strong>{" "}
                        {editing?.createdAt
                          ? dayjs(editing.createdAt).format("DD MMM, YYYY • HH:mm")
                          : "—"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>Lead ID:</strong>{" "}
                        {editing?._id || editing?.id || "—"}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAttemptModal && activeLead && (
        <AttemptModal
          lead={activeLead}
          onClose={() => {
            setShowAttemptModal(false);
            setActiveLead(null);
          }}
          onSave={addAttempt}
        />
      )}
      {showRemarkModal && activeLead && (
        <RemarkModal
          lead={activeLead}
          onClose={() => {
            setShowRemarkModal(false);
            setActiveLead(null);
          }}
          onSave={addRemark}
        />
      )}
      {showDemoModal && activeLead && (
        <DemoModal
          lead={activeLead}
          onClose={() => {
            setShowDemoModal(false);
            setActiveLead(null);
          }}
          onSave={bookDemo}
        />
      )}
      {showConvertModal && activeLead && (
        <ConvertModal
          lead={activeLead}
          onClose={() => {
            setShowConvertModal(false);
            setActiveLead(null);
          }}
          onSave={convertLead}
        />
      )}
    </div>
  );
}
